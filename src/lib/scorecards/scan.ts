import { normalizeScanResult } from "@/lib/scoring/scan/normalize";
import type { ScorecardScanResult } from "@/lib/scoring/scan/types";

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
