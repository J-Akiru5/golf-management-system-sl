import type { GithubClient } from "./client";
import { GithubError } from "./client";
import { type OutboundInput, planOutbound } from "./decide";
import type { GithubIssue } from "./types";

/**
 * Pushing one saved task to GitHub.
 *
 * The push never throws: the workspace save has already happened, and a GitHub problem must not
 * turn a saved task into an error on screen. The caller records the result in the sync log, so the
 * owner can see that the push did not land.
 */

export type PushOutcome =
  | { outcome: "applied"; issue: GithubIssue; detail: string }
  | { outcome: "skipped"; detail: string }
  | { outcome: "error"; detail: string };

/** A sentence safe to show the owner. It never carries the token or a request header. */
export function safeError(error: unknown): string {
  if (error instanceof GithubError) {
    if (error.status === 401 || error.status === 403) {
      return `GitHub refused the request (${error.status}): ${error.message}`;
    }
    return `GitHub answered ${error.status}: ${error.message}`;
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message.slice(0, 300);
  }
  return "GitHub could not be reached.";
}

export async function pushTaskToGithub(
  input: OutboundInput,
  client: GithubClient,
): Promise<PushOutcome> {
  const plan = planOutbound(input);
  if (plan.kind === "none") return { outcome: "skipped", detail: plan.reason };

  try {
    const issue = await client.updateIssue(input.link.issueNumber, plan.patch);
    return { outcome: "applied", issue, detail: plan.detail };
  } catch (error) {
    return { outcome: "error", detail: safeError(error) };
  }
}
