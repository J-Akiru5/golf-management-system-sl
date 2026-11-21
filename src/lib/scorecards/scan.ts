import { normalizeScanResult } from "@/lib/scoring/scan/normalize";
import type { ScorecardScanResult } from "@/lib/scoring/scan/types";
import type { FieldLookup, FieldPlayer } from "./field";

/**
 * Reading a card photo for the tabulation page.
 *
 * The staff scan routes need a club-member session and R2 storage, and the tabulation team has
 * neither. This path takes the photo straight from the page, passes it to the same card reader
 * (`SCAN_INFERENCE_URL`), checks the answer with the same `normalizeScanResult`, and returns the
 * draft. The photo is not stored; the paper card stays the record the desk checks against.
 */

/** A serverless request body is capped near 4.5 MB, so the page shrinks the photo to fit. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type CardPhotoResult =
  | { ok: true; available: true; result: ScorecardScanResult }
  | { ok: true; available: false; message: string }
  | { ok: false; status: number; message: string };

export function isPhotoType(value: string): boolean {
  return (PHOTO_TYPES as readonly string[]).includes(value);
}

export async function readCardPhoto(input: {
  bytes: Uint8Array;
  mime: string;
  mode: "individual" | "group";
  serviceUrl: string | undefined;
  token?: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<CardPhotoResult> {
  if (!isPhotoType(input.mime)) {
    return { ok: false, status: 400, message: "Use a JPEG, PNG or WebP photo." };
  }
  if (input.bytes.length <= 0 || input.bytes.length > MAX_PHOTO_BYTES) {
    return { ok: false, status: 413, message: "The photo must be smaller than 4 MB." };
  }
  const serviceUrl = input.serviceUrl?.trim();
  if (!serviceUrl) {
    return {
      ok: true,
      available: false,
      message:
        "The card reader is not connected on this deployment, so no scores can be drafted. Enter the scores by hand from the paper card. An owner can connect the reader by setting SCAN_INFERENCE_URL.",
    };
  }

  const form = new FormData();
  form.append(
    "image",
    new Blob([input.bytes as unknown as BlobPart], { type: input.mime }),
    "scorecard.jpg",
  );
  form.append("mode", input.mode);
  form.append("template", "igcc-paper");
  const token = input.token?.trim();
  try {
    const response = await (input.fetchImpl ?? fetch)(serviceUrl, {
      method: "POST",
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        message: `The card reader refused the photo (${response.status}).`,
      };
    }
    const result = normalizeScanResult(await response.json());
    if (!result) {
      return { ok: false, status: 502, message: "The card reader returned an unreadable answer." };
    }
    return { ok: true, available: true, result };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      status: 504,
      message: timedOut
        ? "The card reader took too long. Try again, or enter the card by hand."
        : "The card reader could not be reached. Try again, or enter the card by hand.",
    };
  }
}

/**
 * A printed card's QR code holds one identifier and nothing else. The owner's decision of
 * 21 Nov 2026 is one code per printed group sheet, the group card id
 * `grp-<day>-<session>-<groupNumber>`; scanning it opens every player in that group. The previous
 * per-player code (the player row id, or the stored `fld-...` key) is still accepted, so a card
 * printed before the change resolves one player.
 *
 * No name, NGAP number, URL or score goes on the paper.
 */
export const CARD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

/** The per-player payload used before the single group code. Kept for older printed cards. */
export function cardQrPayload(cardId: string): string {
  const id = cardId.trim();
  return CARD_ID_PATTERN.test(id) ? id : "";
}

/**
 * The card id a scanned QR value holds, or null when it is not a card code. This accepts the old
 * per-player id, the stored `fld-...` key and the new `grp-...` group code; use
 * `parseGroupCardQr` when the value has to be resolved as a group.
 */
export function parseCardQr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return CARD_ID_PATTERN.test(id) ? id : null;
}

/** A locale-independent order for printed player rows: accents folded and upper case. */
export function printNameOrder(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export type CardSession = "AM" | "PM";

/**
 * The session a printed group's tee time belongs to. This is the same rule as the tabulator field
 * list (`sessionFromTeeTime` in `field.ts`): the event's afternoon start, with 12:30 as the
 * fallback. Null when the print sheet has no tee time, so a group code is never guessed.
 */
export function sessionForTeeTime(teeTime: string, pmFirst?: string | null): CardSession | null {
  const time = teeTime.trim().slice(0, 5);
  if (!time) return null;
  const afternoon = pmFirst?.trim().slice(0, 5) || "12:30";
  return time < afternoon ? "AM" : "PM";
}

/**
 * The one code printed on a group's scorecard sheet: `grp-<day>-<session>-<groupNumber>`, for
 * example `grp-1-am-24`. Empty when any part cannot be built, so the sheet shows "No code" rather
 * than a guessed group.
 */
export function groupCardQrPayload(
  dayNumber: number | null | undefined,
  session: CardSession | null | undefined,
  groupNumber: number | null | undefined,
): string {
  if (dayNumber == null || !Number.isInteger(dayNumber) || dayNumber < 1) return "";
  if (!session) return "";
  if (groupNumber == null || !Number.isInteger(groupNumber) || groupNumber < 1) return "";
  return `grp-${dayNumber}-${session.toLowerCase()}-${groupNumber}`;
}

export interface GroupCardQr {
  dayNumber: number;
  session: CardSession;
  groupNumber: number;
}

const GROUP_CARD_QR = /^grp-([1-9]\d*)-(am|pm)-([1-9]\d*)$/;

/** The day, session and group in a `grp-...` code, or null when the value is not one. */
export function parseGroupCardQr(value: unknown): GroupCardQr | null {
  const id = parseCardQr(value);
  if (!id) return null;
  const match = GROUP_CARD_QR.exec(id);
  if (!match) return null;
  const day = match[1];
  const session = match[2];
  const group = match[3];
  if (!day || !session || !group) return null;
  const dayNumber = Number(day);
  const groupNumber = Number(group);
  if (!Number.isSafeInteger(dayNumber) || !Number.isSafeInteger(groupNumber)) return null;
  return { dayNumber, session: session === "am" ? "AM" : "PM", groupNumber };
}

/**
 * The field player a printed card id names, in one day's list. The direct match is the player row
 * id or the event registration id; the stored day-document shape is also accepted so a code from a
 * later print layout keeps working.
 */
export function findFieldCard(
  field: Pick<FieldLookup, "players"> | null | undefined,
  cardId: unknown,
): FieldPlayer | null {
  const id = parseCardQr(cardId);
  if (!id || !field) return null;
  const direct = field.players.find(
    (player) => player.playerId === id || player.registrationId === id,
  );
  if (direct) return direct;
  const stored = /^fld-(.+)-d\d+-(?:am|pm)$/i.exec(id);
  const playerId = stored?.[1];
  if (!playerId) return null;
  return field.players.find((player) => player.playerId === playerId) ?? null;
}
