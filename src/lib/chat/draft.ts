/**
 * The concern draft: a player's partial answer, merged from what the model extracted and checked by
 * the contract in `src/lib/data/concerns.ts`.
 *
 * Pure. The draft is the chat's state machine: `nextMissingField` decides what to ask, and the model
 * only chooses the words. Nothing here trusts the model with a value the contract would refuse: an
 * unknown concern, a hole outside 1 to 18, a tee colour that is not one of the four, or text over
 * the limit is dropped, never coerced into a default.
 */

import {
  CONCERN_KINDS,
  CONCERN_TEXT_MAX,
  type ConcernDetails,
  type ConcernKind,
  HOLE_MAX,
  HOLE_MIN,
  normaliseConcern,
  TEE_COLOURS,
  type TeeColour,
} from "@/lib/data/concerns";
import { type ChatLocale, chatCopy } from "./copy";
import { type ConcernField, OPTIONAL_CONCERN_FIELDS, type OptionalConcernField } from "./fields";

export interface ConcernDraft {
  concerns: ConcernKind[];
  holeNo?: number;
  teeColour?: TeeColour;
  otherText?: string;
  playerName?: string;
  handicap?: string;
  schedule?: string;
  /** Optional fields the player has declined. They are never asked again. */
  declined: OptionalConcernField[];
}

/** What the model may report it heard this turn. Every value is re-checked before it is kept. */
export interface ConcernPatch {
  concerns?: unknown;
  holeNo?: unknown;
  teeColour?: unknown;
  otherText?: unknown;
  playerName?: unknown;
  handicap?: unknown;
  schedule?: unknown;
}

/** The payload handed to `normaliseConcern`. It has no transcript; the submit route adds one. */
export type ConcernDraftPayload = Omit<ConcernDetails, "transcript">;

export function emptyConcernDraft(): ConcernDraft {
  return { concerns: [], declined: [] };
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\s+/g, " ");
  if (text === "") return undefined;
  return text.slice(0, CONCERN_TEXT_MAX);
}

/**
 * A hole is a bare number. "Hole 7" or "around 7" is not read here, because guessing which number a
 * sentence means is how a note ends up about the wrong hole.
 */
function asHole(value: unknown): number | undefined {
  const number = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof number !== "number" || !Number.isInteger(number)) return undefined;
  return number >= HOLE_MIN && number <= HOLE_MAX ? number : undefined;
}

function asTeeColour(value: unknown): TeeColour | undefined {
  if (typeof value !== "string") return undefined;
  const colour = value.trim().toLowerCase();
  return TEE_COLOURS.find((tee) => tee === colour);
}

function asConcerns(value: unknown): ConcernKind[] {
  if (!Array.isArray(value)) return [];
  const kinds: ConcernKind[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const kind = CONCERN_KINDS.find((candidate) => candidate === item.trim().toLowerCase());
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}

/**
 * Merges one turn's extraction into the draft.
 *
 * Concerns are added, never removed: a player who corrects themselves says so in the summary card's
 * Edit step, which is the one place the note is final. A follow-up value is kept only when its
 * concern is ticked, which is the same rule `normaliseConcern` applies to the stored note.
 */
export function mergeConcernDraft(draft: ConcernDraft, patch: ConcernPatch): ConcernDraft {
  const merged: ConcernDraft = {
    ...draft,
    concerns: [...draft.concerns],
    declined: [...draft.declined],
  };

  for (const kind of asConcerns(patch.concerns)) {
    if (!merged.concerns.includes(kind)) merged.concerns.push(kind);
  }

  if (merged.concerns.includes("score")) {
    const hole = asHole(patch.holeNo);
    if (hole !== undefined) merged.holeNo = hole;
  }
  if (merged.concerns.includes("tee_off")) {
    const tee = asTeeColour(patch.teeColour);
    if (tee !== undefined) merged.teeColour = tee;
  }
  if (merged.concerns.includes("other")) {
    const other = cleanText(patch.otherText);
    if (other !== undefined) merged.otherText = other;
  }

  if (patch.playerName !== undefined) {
    const name = cleanText(patch.playerName);
    if (name !== undefined) merged.playerName = name;
  }
  if (patch.handicap !== undefined) {
    const handicap = cleanText(patch.handicap);
    if (handicap !== undefined) merged.handicap = handicap;
  }
  if (patch.schedule !== undefined) {
    const schedule = cleanText(patch.schedule);
    if (schedule !== undefined) merged.schedule = schedule;
  }

  return merged;
}

/** Records that the player declined an optional field, and stops asking for it. */
export function declineConcernFields(
  draft: ConcernDraft,
  fields: readonly OptionalConcernField[],
): ConcernDraft {
  const declined = [...draft.declined];
  for (const field of fields) {
    if (!declined.includes(field) && draft[field] === undefined) declined.push(field);
  }
  return { ...draft, declined };
}

/** The payload `normaliseConcern` validates. Only fields the draft actually has are included. */
export function toConcernPayload(draft: ConcernDraft): ConcernDraftPayload {
  const payload: ConcernDraftPayload = {
    concerns: [...draft.concerns],
    source: "chat",
  };
  if (draft.concerns.includes("score") && draft.holeNo !== undefined) payload.holeNo = draft.holeNo;
  if (draft.concerns.includes("tee_off") && draft.teeColour !== undefined) {
    payload.teeColour = draft.teeColour;
  }
  if (draft.concerns.includes("other") && draft.otherText !== undefined) {
    payload.otherText = draft.otherText;
  }
  if (draft.playerName !== undefined) payload.playerName = draft.playerName;
  if (draft.handicap !== undefined) payload.handicap = draft.handicap;
  if (draft.schedule !== undefined) payload.schedule = draft.schedule;
  return payload;
}

/**
 * The next thing to ask, or null when the note is ready to confirm.
 *
 * The required fields come from `normaliseConcern`, so the chat cannot ask for something the
 * database would not require, or stop before something it does. The optional three are asked in a
 * fixed order and accepted when declined.
 */
export function nextMissingField(draft: ConcernDraft): ConcernField | null {
  const checked = normaliseConcern(toConcernPayload(draft));
  if (!checked.ok) {
    switch (checked.problem) {
      case "hole_required":
      case "hole_out_of_range":
        return "holeNo";
      case "tee_required":
      case "tee_unknown":
        return "teeColour";
      case "other_required":
      // The merge truncates text to the contract's limit, so "too_long" cannot be reached through
      // this path; asking again for the free-text answer is the safe answer if it ever is.
      case "too_long":
        return "otherText";
      case "no_concern":
      case "unknown_concern":
      case "bad_source":
      case "bad_transcript":
      default:
        return "concerns";
    }
  }

  for (const field of OPTIONAL_CONCERN_FIELDS) {
    if (draft[field] === undefined && !draft.declined.includes(field)) return field;
  }
  return null;
}

export function isConcernDraftComplete(draft: ConcernDraft): boolean {
  return nextMissingField(draft) === null;
}

export interface ConcernSummaryRow {
  field: ConcernField;
  label: string;
  value: string;
}

/**
 * The summary card's rows, in the player's language. Only what the player gave appears; a declined
 * field is listed separately by the panel, not invented here.
 */
export function summariseForPlayer(draft: ConcernDraft, locale: ChatLocale): ConcernSummaryRow[] {
  const copy = chatCopy(locale);
  const rows: ConcernSummaryRow[] = [];

  if (draft.concerns.length > 0) {
    rows.push({
      field: "concerns",
      label: copy.fieldLabels.concerns,
      value: draft.concerns.map((kind) => copy.concernLabels[kind]).join(", "),
    });
  }
  if (draft.concerns.includes("score") && draft.holeNo !== undefined) {
    rows.push({
      field: "holeNo",
      label: copy.fieldLabels.holeNo,
      value: String(draft.holeNo),
    });
  }
  if (draft.concerns.includes("tee_off") && draft.teeColour !== undefined) {
    rows.push({
      field: "teeColour",
      label: copy.fieldLabels.teeColour,
      value: copy.teeLabels[draft.teeColour],
    });
  }
  if (draft.concerns.includes("other") && draft.otherText !== undefined) {
    rows.push({
      field: "otherText",
      label: copy.fieldLabels.otherText,
      value: draft.otherText,
    });
  }
  for (const field of OPTIONAL_CONCERN_FIELDS) {
    const value = draft[field];
    if (value === undefined) continue;
    rows.push({ field, label: copy.fieldLabels[field], value });
  }

  return rows;
}
