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
 * The printed card's QR code holds one identifier and nothing else: the player row id that the
 * scoring round and the day document's card are built from. No name, NGAP number or URL goes on
 * the paper. The printed card is one card per group, so each player's row carries its own code;
 * the tabulator scans the card, resolves each id in the chosen day's field list, and gets the
 * player, tee, class and current playing handicap from there.
 *
 * This is deliberately the player id, not the day document's storage key
 * (`fld-<playerId>-d<day>-<session>`): the print props carry no day or registration id, and the
 * round is the day the tabulator is working on. A future full card id is also accepted by
 * `findFieldCard`, which reads the player id out of that shape.
 */
export const CARD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

/** The printed payload for a card id, or an empty string when the id cannot go on paper. */
export function cardQrPayload(cardId: string): string {
  const id = cardId.trim();
  return CARD_ID_PATTERN.test(id) ? id : "";
}

/** The card id a scanned QR value holds, or null when it is not a card code. */
export function parseCardQr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return CARD_ID_PATTERN.test(id) ? id : null;
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
