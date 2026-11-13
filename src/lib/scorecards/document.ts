/**
 * The editable scorecard document.
 *
 * This is a local-first app: the page owns the editing UI and the API stores the whole state as a
 * JSON document. The validator is deliberately structural, not a golf-rule check. It refuses a
 * document that could corrupt the page, but it does not reject a card because a score is unusual.
 */

export const SCORECARD_SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export interface ScorecardDocumentInput {
  slug: string;
  event: string;
  label: string;
  payload: Record<string, unknown>;
}

export type ScorecardPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A slug is the document's stable key, so keep it to URL-safe text. */
export function normalizeSlug(value: unknown): string {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return SCORECARD_SLUG.test(text) ? text : "";
}

function validHole(value: unknown): boolean {
  if (value === "" || value === "X" || value === "x") return true;
  if (typeof value === "number") return Number.isInteger(value) && value >= 1 && value <= 20;
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text === "" || text.toUpperCase() === "X") return true;
  if (!/^\d{1,2}$/.test(text)) return false;
  const strokes = Number(text);
  return strokes >= 1 && strokes <= 20;
}

/** The page state must contain cards, and each card must contain exactly 18 holes. */
export function validateScorecardPayload(value: unknown): ScorecardPayloadResult {
  if (!isRecord(value)) return { ok: false, message: "The scorecard payload must be an object." };
  if (!Array.isArray(value.cards)) {
    return { ok: false, message: "The scorecard payload must contain a cards array." };
  }
  if (value.cards.length > 200) {
    return { ok: false, message: "The scorecard payload has more than 200 cards." };
  }
  for (const [index, card] of value.cards.entries()) {
    if (!isRecord(card)) return { ok: false, message: `Card ${index + 1} is not an object.` };
    if (typeof card.id !== "string" || !card.id.trim()) {
      return { ok: false, message: `Card ${index + 1} has no id.` };
    }
    if (typeof card.name !== "string") {
      return { ok: false, message: `Card ${index + 1} has no name.` };
    }
    if (!Array.isArray(card.holes) || card.holes.length !== 18) {
      return { ok: false, message: `Card ${index + 1} must have 18 holes.` };
    }
    const badHole = card.holes.findIndex((hole) => !validHole(hole));
    if (badHole >= 0) {
      return {
        ok: false,
        message: `Card ${index + 1}, hole ${badHole + 1} is not a score from 1 to 20 or X.`,
      };
    }
  }
  return { ok: true, payload: value };
}

export function cleanLabel(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text.length > 0 && text.length <= 120 ? text : fallback;
}
