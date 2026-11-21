import type { WsTaskRow } from "@/lib/db/types";
import { demoMode } from "@/lib/flags";
import { createGithubClient } from "./client";
import { githubRepository, githubToken } from "./config";
import { NOTHING_TO_PUSH } from "./decide";
import { readTaskLink } from "./links";
import { serverGithubRepo } from "./repo";
import { pushTaskToGithub } from "./sync";

/**
 * The workspace -> GitHub hook the task server actions call after a save.
 *
 * It runs after the workspace write has already succeeded, and it never throws: a missing token, a
 * missing migration, an unreachable GitHub or a refused request is recorded in the sync log and the
 * task stays saved. Nothing here reads a token into a value that leaves this module.
 */
export async function syncSavedTask(before: WsTaskRow, after: WsTaskRow): Promise<void> {
  if (demoMode()) return;

  const link = readTaskLink(after);
  if (link === null) return;

  let repo: Awaited<ReturnType<typeof serverGithubRepo>>;
  try {
    repo = await serverGithubRepo();
  } catch {
    // The session or the sync tables are not readable. The save stands; the Settings screen
    // reports the configuration.
    return;
  }

  const token = githubToken();
  if (token === null) {
    try {
      await repo.markSynced(
        after.id,
        null,
        "outbound",
        "error",
        "GITHUB_TOKEN is not set on this deployment, so the change was not pushed.",
      );
    } catch {
      // Logging is best effort; the task is already saved.
    }
    return;
  }

  try {
    const members = await repo.listUserMap();
    const client = createGithubClient({ token, repository: githubRepository() });
    const result = await pushTaskToGithub(
      {
        link,
        before: { title: before.title, status: before.status, assigneeId: before.assignee_id },
        after: { title: after.title, status: after.status, assigneeId: after.assignee_id },
        members: members.map((member) => ({ login: member.login, memberId: member.memberId })),
      },
      client,
    );

    if (result.outcome === "skipped" && result.detail === NOTHING_TO_PUSH) return;

    await repo.markSynced(
      after.id,
      result.outcome === "applied" ? result.issue : null,
      "outbound",
      result.outcome,
      result.detail,
    );
  } catch (error) {
    try {
      await repo.markSynced(
        after.id,
        null,
        "outbound",
        "error",
        error instanceof Error && error.message.trim() !== ""
          ? error.message.slice(0, 300)
          : "The GitHub push could not be recorded.",
      );
    } catch {
      // Nothing else to do: the task save is the outcome the person sees.
    }
  }
}
