/**
 * Reads the model's strict JSON block into fields this code can check.
 *
 * The model is asked for one JSON object per turn:
 *
 *   {
 *     "language": "en" | "tl" | "hil" | "ceb",
 *     "reply": "one short warm answer, in the player's language",
 *     "details": { ... only what the player actually stated ... },
 *     "declined": ["handicap"]
 *   }
 *
 * Nothing here is trusted. Every value is either re-validated by `mergeConcernDraft` and
 * `normaliseConcern`, or dropped. A model that answers in plain prose is still usable: the prose
 * becomes the reply and no field is extracted, so the code asks again rather than inventing one.
 *
 * Pure, and tested against fenced JSON, junk and a bare sentence.
 */

import { type ChatLocale, isChatLocale } from "./copy";
import type { ConcernPatch } from "./draft";
import { isOptionalConcernField, type OptionalConcernField } from "./fields";

export const REPLY_MAX_CHARS = 800;

export interface ModelTurn {
  reply: string;
  /** The language the model says the player used, when it named one this app speaks. */
  language: ChatLocale | null;
  patch: ConcernPatch;
  declined: OptionalConcernField[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanReply(value: unknown): string {
  if (typeof value !== "string") return "";
  // Control characters would break the panel's layout and carry no meaning here.
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, REPLY_MAX_CHARS);
}

/** Removes a markdown fence and returns the widest object literal in the text, or null. */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return asRecord(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function patchFrom(source: Record<string, unknown> | null): ConcernPatch {
  if (!source) return {};
  // Accept the documented `details` object, and the same keys at the top level, because a smaller
  // model sometimes flattens the shape. Every value is re-checked either way.
  return {
    concerns: source.concerns,
    holeNo: source.holeNo,
    teeColour: source.teeColour,
    otherText: source.otherText,
    playerName: source.playerName,
    handicap: source.handicap,
    schedule: source.schedule,
  };
}

function declinesFrom(value: unknown): OptionalConcernField[] {
  if (!Array.isArray(value)) return [];
  const declined: OptionalConcernField[] = [];
  for (const item of value) {
    if (isOptionalConcernField(item) && !declined.includes(item)) declined.push(item);
  }
  return declined;
}

/**
 * Parses one model answer. Returns null only when there is nothing usable at all: an empty answer,
 * or a JSON object with no reply and no details.
 */
export function parseModelTurn(raw: string | null | undefined): ModelTurn | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const object = extractJsonObject(trimmed);
  if (!object) {
    const reply = cleanReply(trimmed);
    return reply === "" ? null : { reply, language: null, patch: {}, declined: [] };
  }

  const details = asRecord(object.details);
  const reply = cleanReply(object.reply ?? object.message);
  const patch = { ...patchFrom(object), ...patchFrom(details) };
  const language = isChatLocale(object.language) ? object.language : null;
  const declined = declinesFrom(object.declined);

  const hasPatch = Object.values(patch).some(
    (value) => value !== undefined && !(Array.isArray(value) && value.length === 0),
  );
  if (reply === "" && !hasPatch) return null;

  return { reply, language, patch, declined };
}
