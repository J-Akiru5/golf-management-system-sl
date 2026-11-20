/**
 * The event contract between the concern route and its panel.
 *
 * The route sends Server-Sent Events, one JSON object per `data:` line. The panel only acts on a
 * validated event, so a malformed frame is ignored rather than half-applied.
 */

import { type ChatLocale, isChatLocale } from "./copy";
import type { ConcernDraft, ConcernSummaryRow } from "./draft";
import type { ConcernField, OptionalConcernField } from "./fields";

export type ConcernChatEvent =
  | {
      type: "meta";
      language: ChatLocale;
      /** True when the reply is the fixed fallback and the panel should offer the form. */
      fallback: boolean;
      reason: string | null;
    }
  | { type: "delta"; text: string }
  | {
      type: "draft";
      draft: ConcernDraft;
      next: ConcernField | null;
      complete: boolean;
      /** The summary card's rows, already in the player's language. */
      summary: ConcernSummaryRow[];
      declined: OptionalConcernField[];
    }
  | { type: "done"; fallback: boolean }
  | { type: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDraft(value: unknown): value is ConcernDraft {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.concerns) && Array.isArray(value.declined) && value.concerns.length >= 0
  );
}

/** Reads one frame. Anything unexpected is ignored: a bad frame must not break the panel. */
export function parseConcernChatEvent(value: unknown): ConcernChatEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  switch (value.type) {
    case "meta":
      if (!isChatLocale(value.language)) return null;
      return {
        type: "meta",
        language: value.language,
        fallback: value.fallback === true,
        reason: typeof value.reason === "string" ? value.reason : null,
      };
    case "delta":
      return typeof value.text === "string" ? { type: "delta", text: value.text } : null;
    case "draft":
      if (!isDraft(value.draft)) return null;
      return {
        type: "draft",
        draft: value.draft,
        next: typeof value.next === "string" ? (value.next as ConcernField) : null,
        complete: value.complete === true,
        summary: Array.isArray(value.summary) ? (value.summary as ConcernSummaryRow[]) : [],
        declined: Array.isArray(value.declined) ? (value.declined as OptionalConcernField[]) : [],
      };
    case "done":
      return { type: "done", fallback: value.fallback === true };
    case "error":
      return {
        type: "error",
        message: typeof value.message === "string" ? value.message : "The reply could not be read.",
      };
    default:
      return null;
  }
}
