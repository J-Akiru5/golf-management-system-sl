import type { GithubIssue, GithubIssueState } from "./types";

/**
 * Reading a GitHub issue out of a webhook payload or a REST response.
 *
 * Both shapes are the same object (the webhook sends `issue`), so there is one reader. Anything
 * that cannot be read with certainty returns null: the sync then refuses the event instead of
 * writing a guessed title or state.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function names(value: unknown, key: "name" | "login"): string[] {
  if (!Array.isArray(value)) return [];
  const found: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const direct = text(entry);
      if (direct) found.push(direct);
      continue;
    }
    if (!isRecord(entry)) continue;
    const label = text(entry[key]);
    if (label) found.push(label);
  }
  // Compare case-insensitively without losing the display form; duplicates are dropped.
  const seen = new Set<string>();
  return found.filter((entry) => {
    const key2 = entry.toLowerCase();
    if (seen.has(key2)) return false;
    seen.add(key2);
    return true;
  });
}

function state(value: unknown): GithubIssueState | null {
  return value === "open" || value === "closed" ? value : null;
}

/** True for the `pull_request` key a list of issues also contains. */
export function isPullRequest(value: unknown): boolean {
  return isRecord(value) && value.pull_request !== undefined && value.pull_request !== null;
}

/** One issue, or null when the number, the title, the state or the timestamp cannot be trusted. */
export function parseGithubIssue(value: unknown): GithubIssue | null {
  if (!isRecord(value)) return null;

  const number = value.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) return null;

  const title = text(value.title);
  if (title === null) return null;

  const issueState = state(value.state);
  if (issueState === null) return null;

  const updatedAt = text(value.updated_at);
  if (updatedAt === null || !Number.isFinite(Date.parse(updatedAt))) return null;

  const url = text(value.html_url) ?? text(value.url);
  if (url === null) return null;

  const milestone = isRecord(value.milestone) ? text(value.milestone.title) : text(value.milestone);

  return {
    number,
    title,
    body: typeof value.body === "string" ? value.body : null,
    state: issueState,
    labels: names(value.labels, "name"),
    milestone,
    assignees: names(value.assignees, "login"),
    url,
    updatedAt,
  };
}

/** The `issue` object of an `issues` webhook delivery, or null. */
export function issueFromEvent(payload: unknown): GithubIssue | null {
  if (!isRecord(payload)) return null;
  return parseGithubIssue(payload.issue);
}
