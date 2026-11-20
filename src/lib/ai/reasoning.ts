import type { ReasoningEffort } from "./types";

/**
 * Normalises a reasoning-effort setting. "none"/"off"/"disabled" drop the reasoning parameter
 * entirely; anything unrecognised falls back to "low", which is enough for short question phrasing
 * and keeps the first token quick for a player on a phone.
 */
export function parseReasoningEffort(raw: string | null | undefined): ReasoningEffort {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "none" || value === "off" || value === "disabled") return "none";
  if (value === "low") return "low";
  if (value === "medium" || value === "high") return value;
  return "low";
}
