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

/**
 * Turns one hole cell into the text the page stores, or `null` when it is not a usable score.
 *
 * A blank is a blank, however a file spells it: nothing, `null`, `0`, `-` or the `{ "v": ... }`
 * cell the first reading used. A real score is 1 to 20 and `X` is a pick-up. Anything else is
 * returned as `null` so the caller refuses it by name instead of storing a guess.
 */
export function normalizeHole(value: unknown): string | null {
  const cell = isRecord(value) && "v" in value ? value.v : value;
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") {
    if (cell === 0) return "";
    return Number.isInteger(cell) && cell >= 1 && cell <= 20 ? String(cell) : null;
  }
  if (typeof cell !== "string") return null;
  const text = cell.trim();
  if (text === "" || text === "0" || text === "00" || /^[-–—]+$/.test(text)) return "";
  if (text.toUpperCase() === "X") return "X";
  if (!/^\d{1,2}$/.test(text)) return null;
  const strokes = Number(text);
  return strokes >= 1 && strokes <= 20 ? String(strokes) : null;
}

/**
 * The page state must contain a `cards` array, and each card must contain exactly 18 holes. There
 * is no fixed card count: one document can hold every playing day. Blanks are accepted in every
 * spelling a scan or an older export uses and are stored as empty text; a real out-of-range score
 * is refused with the card and hole named so it can be fixed on the page.
 */
export function validateScorecardPayload(value: unknown): ScorecardPayloadResult {
  if (!isRecord(value)) return { ok: false, message: "The scorecard payload must be an object." };
  if (!Array.isArray(value.cards)) {
    return { ok: false, message: "The scorecard payload must contain a cards array." };
  }
  const cards: Record<string, unknown>[] = [];
  for (const [index, card] of value.cards.entries()) {
    const label =
      isRecord(card) && typeof card.name === "string" && card.name.trim()
        ? `Card ${index + 1} (${card.name.trim()})`
        : `Card ${index + 1}`;
    if (!isRecord(card)) return { ok: false, message: `Card ${index + 1} is not an object.` };
    if (typeof card.id !== "string" || !card.id.trim()) {
      return { ok: false, message: `${label} has no id.` };
    }
    if (typeof card.name !== "string") {
      return { ok: false, message: `${label} has no name.` };
    }
    if (!Array.isArray(card.holes) || card.holes.length !== 18) {
      return { ok: false, message: `${label} must have 18 holes.` };
    }
    const holes: string[] = [];
    for (const [holeIndex, hole] of card.holes.entries()) {
      const normalized = normalizeHole(hole);
      if (normalized === null) {
        return {
          ok: false,
          message: `${label}, hole ${holeIndex + 1} is not a score from 1 to 20 or X.`,
        };
      }
      holes.push(normalized);
    }
    cards.push({ ...card, holes });
  }
  return { ok: true, payload: { ...value, cards } };
}

export function cleanLabel(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text.length > 0 && text.length <= 120 ? text : fallback;
}
