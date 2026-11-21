import type { GithubIssueState, TaskGithubLink } from "./types";

/**
 * Reading the GitHub link out of a task row.
 *
 * The row type in `lib/db/types` is the orchestrator's and does not carry the sync columns, so this
 * module reads them from the row it is given without changing that contract. It is also what the
 * client components use: a realtime broadcast carries the whole row, so a badge stays right after a
 * GitHub change without a reload. Anything unrecognised reads as "not linked" rather than throwing.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

function issueState(value: unknown): GithubIssueState | null {
  return value === "open" || value === "closed" ? value : null;
}

/** The link for one task row, or null when the task is not linked to an issue. */
export function readTaskLink(row: object): TaskGithubLink | null {
  if (!isRecord(row)) return null;

  const number = positiveInteger(row.github_issue_number);
  if (number === null) return null;

  return {
    issueNumber: number,
    url: optionalText(row.github_url),
    state: issueState(row.github_state),
    labels: textList(row.github_labels),
    milestone: optionalText(row.github_milestone),
    assignees: textList(row.github_assignees),
    githubUpdatedAt: optionalText(row.github_updated_at),
    syncedAt: optionalText(row.synced_at),
  };
}

/** The links of many rows, keyed by task id, for the list and the board. */
export function linkMap(rows: ReadonlyArray<object>): Map<string, TaskGithubLink> {
  const map = new Map<string, TaskGithubLink>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== "string") continue;
    const link = readTaskLink(row);
    if (link) map.set(row.id, link);
  }
  return map;
}

/** The issue number a task is linked to, or null. Used by the sync to decide whether to push. */
export function linkedIssueNumber(row: object): number | null {
  return readTaskLink(row)?.issueNumber ?? null;
}
