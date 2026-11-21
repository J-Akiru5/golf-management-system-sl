import type { TaskStatus } from "@/lib/db/types";
import type { GithubIssuePatch } from "./client";
import type { TaskGithubLink } from "./types";

/**
 * The two decisions the sync makes before it writes anything.
 *
 * `isEcho` is the loop guard: GitHub reports back the edit we just pushed, and that report must not
 * bounce the change into the workspace again. `planOutbound` turns a saved workspace task into the
 * smallest GitHub patch: only what changed, nothing invented.
 *
 * The database enforces the same rules atomically (see gh_apply_issue). This module exists so the
 * route can skip a delivery that is obviously an echo, and so the rules are testable without a
 * database or a network.
 */

/** True when the issue event is no newer than the last change we saw or pushed. */
export function isEcho(
  link: Pick<TaskGithubLink, "githubUpdatedAt">,
  issueUpdatedAt: string,
): boolean {
  if (link.githubUpdatedAt === null) return false;
  const last = Date.parse(link.githubUpdatedAt);
  const next = Date.parse(issueUpdatedAt);
  // An unreadable timestamp is not treated as an echo: the database makes the final call.
  if (!Number.isFinite(last) || !Number.isFinite(next)) return false;
  return next <= last;
}

export type OutboundMember = { login: string; memberId: string };

export type OutboundTask = {
  title: string;
  status: TaskStatus;
  assigneeId: string | null;
};

export type OutboundInput = {
  link: TaskGithubLink;
  before: OutboundTask;
  after: OutboundTask;
  /** The owner-maintained GitHub login to member map. */
  members: ReadonlyArray<OutboundMember>;
};

export type OutboundPlan =
  | { kind: "none"; reason: string }
  | { kind: "update"; patch: GithubIssuePatch; detail: string };

const FIELD_WORDS = {
  title: "title",
  state: "status",
  assignees: "assignee",
} as const;

/** The reason `planOutbound` gives when the save changed nothing GitHub owns. */
export const NOTHING_TO_PUSH = "Nothing GitHub owns has changed";

function stateFor(status: TaskStatus): "open" | "closed" {
  return status === "done" ? "closed" : "open";
}

function loginsFor(
  members: ReadonlyArray<OutboundMember>,
  memberId: string | null,
): { logins: string[]; mapped: boolean } {
  if (memberId === null) return { logins: [], mapped: true };
  const logins = members
    .filter((member) => member.memberId === memberId)
    .map((member) => member.login.trim().toLowerCase())
    .filter((login) => login !== "");
  return { logins: [...new Set(logins)], mapped: logins.length > 0 };
}

/**
 * The GitHub patch a saved task needs, or `none` when nothing GitHub owns has changed.
 *
 * A title change is pushed as the title. Done and closed follow each other. An assignee is pushed
 * through the owner's map; an unmapped member is left alone, and the reason says so, rather than
 * clearing the issue's assignees on a guess.
 */
export function planOutbound(input: OutboundInput): OutboundPlan {
  const { link, before, after, members } = input;
  if (link.issueNumber <= 0) return { kind: "none", reason: "The task is not linked to an issue" };

  const patch: GithubIssuePatch = {};
  const fields: string[] = [];

  if (after.title !== before.title) {
    patch.title = after.title;
    fields.push(FIELD_WORDS.title);
  }

  if (stateFor(after.status) !== stateFor(before.status)) {
    patch.state = stateFor(after.status);
    fields.push(FIELD_WORDS.state);
  }

  let assigneeNote = "";
  if (after.assigneeId !== before.assigneeId) {
    const { logins, mapped } = loginsFor(members, after.assigneeId);
    if (mapped || after.assigneeId === null) {
      patch.assignees = logins;
      fields.push(FIELD_WORDS.assignees);
    } else {
      assigneeNote = " The assignee was not pushed: no GitHub login is mapped to that member.";
    }
  }

  if (fields.length === 0) {
    return {
      kind: "none",
      reason: assigneeNote.trim() === "" ? NOTHING_TO_PUSH : assigneeNote.trim(),
    };
  }

  const words =
    fields.length === 1
      ? (fields[0] ?? "")
      : `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1] ?? ""}`;

  return {
    kind: "update",
    patch,
    detail: `Pushed the ${words} from the workspace.${assigneeNote}`,
  };
}
