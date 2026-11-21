import type { GithubClient, GithubIssuePatch } from "./client";
import type { GithubSyncRepo } from "./repo";
import { safeError } from "./sync";
import type { GithubIssue, InboundStatus } from "./types";

/**
 * What the webhook does with one issue delivery, and what it does when the workspace already holds
 * a newer edit.
 *
 * The route (app/api/github/webhook) proves the delivery, parses the issue and calls this. Keeping
 * the decision here means the conflict rule is testable without a request, a database or a network.
 */

export type WebhookDeps = {
  repo: GithubSyncRepo;
  /** The token, or null when the deployment has none. A conflict is then only logged. */
  token: string | null;
  /** Builds the GitHub client for a token. Injected so a test never reaches the network. */
  makeClient: (token: string) => GithubClient;
};

export type WebhookResult = {
  status: InboundStatus;
  /** True when a conflicting workspace edit was pushed back to GitHub. */
  pushed: boolean;
};

type StoredTask = { id: string; title: string; status: string };

function storedTask(value: Record<string, unknown> | null): StoredTask | null {
  if (!value) return null;
  const id = value.id;
  const title = value.title;
  const status = value.status;
  if (typeof id !== "string" || typeof title !== "string" || typeof status !== "string") {
    return null;
  }
  return { id, title, status };
}

/**
 * The patch that makes GitHub carry the workspace's newer title and status, or null when GitHub
 * already agrees. Only fields that differ are sent, so a conflict caused by an unrelated edit does
 * not touch the issue.
 */
export function planConflictPush(task: StoredTask, issue: GithubIssue): GithubIssuePatch | null {
  const patch: GithubIssuePatch = {};
  if (task.title !== issue.title) patch.title = task.title;
  const state = task.status === "done" ? "closed" : "open";
  if (state !== issue.state) patch.state = state;
  return Object.keys(patch).length === 0 ? null : patch;
}

export async function applyInboundIssue(
  issue: GithubIssue,
  deps: WebhookDeps,
): Promise<WebhookResult> {
  const applied = await deps.repo.applyIssue(issue, "inbound");
  if (applied.status !== "conflict") return { status: applied.status, pushed: false };

  const task = storedTask(applied.task);
  const patch = task ? planConflictPush(task, issue) : null;
  if (!task || !patch) return { status: "conflict", pushed: false };

  if (deps.token === null) {
    try {
      await deps.repo.markSynced(
        task.id,
        null,
        "outbound",
        "skipped",
        "The workspace edit won, but GITHUB_TOKEN is not set, so it was not pushed.",
      );
    } catch {
      // The log is best effort; the workspace row is already correct.
    }
    return { status: "conflict", pushed: false };
  }

  try {
    const updated = await deps.makeClient(deps.token).updateIssue(issue.number, patch);
    await deps.repo.markSynced(
      task.id,
      updated,
      "outbound",
      "applied",
      "The newer workspace edit was pushed after a conflict.",
    );
    return { status: "conflict", pushed: true };
  } catch (error) {
    try {
      await deps.repo.markSynced(task.id, null, "outbound", "error", safeError(error));
    } catch {
      // Nothing else to record.
    }
    return { status: "conflict", pushed: false };
  }
}
