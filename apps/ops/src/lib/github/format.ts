import type { GithubDirection, GithubOutcome } from "./types";

/**
 * Small labels for the sync log and the detail sheet. The timezone is written down, so the server
 * and the browser draw the same words and a hydration pass cannot disagree.
 */

const MANILA = "Asia/Manila";

/** A stable label for a timestamp, or "Not yet". */
export function formatWhen(iso: string | null): string {
  if (!iso) return "Not yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MANILA,
  }).format(date);
}

export function directionLabel(direction: GithubDirection): string {
  return direction === "inbound" ? "From GitHub" : "To GitHub";
}

export function outcomeLabel(outcome: GithubOutcome): string {
  switch (outcome) {
    case "applied":
      return "Applied";
    case "skipped":
      return "Skipped";
    case "conflict":
      return "Conflict";
    case "error":
      return "Failed";
    default:
      return outcome;
  }
}

/** The colour a log outcome gets. A conflict is a warning, a failure is a danger. */
export function outcomeTone(outcome: GithubOutcome): "success" | "neutral" | "warning" | "danger" {
  switch (outcome) {
    case "applied":
      return "success";
    case "skipped":
      return "neutral";
    case "conflict":
      return "warning";
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}
