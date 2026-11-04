/**
 * The review of a card after the reader has drafted it.
 *
 * The reader returns a confidence per cell and `null` for a cell it could not read. This maps that
 * to what the desk must look at: a value the reader was unsure about, or a hole it left empty, needs
 * a person to check it against the photo. A value typed by hand has no reader confidence and is not
 * flagged, because there is nothing to doubt.
 */
export const WEAK_CONFIDENCE = 0.9;

export type HoleReview = "ok" | "check" | "blank";

export interface ScanReview {
  holes: Record<number, HoleReview>;
  filled: number;
  blank: number;
  /** Holes the reader drafted with low confidence or did not read at all. */
  weak: number;
}

export function scanReview(
  holes: readonly { number: number }[],
  strokes: Record<number, string>,
  confidence: Record<number, number | null>,
): ScanReview {
  const review: Record<number, HoleReview> = {};
  let filled = 0;
  let blank = 0;
  let weak = 0;
  for (const hole of holes) {
    const value = (strokes[hole.number] ?? "").trim();
    const known = confidence[hole.number] !== undefined;
    const score = confidence[hole.number] ?? null;
    let state: HoleReview;
    if (value === "") state = "blank";
    else if (known && (score === null || score < WEAK_CONFIDENCE)) state = "check";
    else state = "ok";
    review[hole.number] = state;
    if (state === "blank") blank += 1;
    else filled += 1;
    if (state === "check") weak += 1;
  }
  return { holes: review, filled, blank, weak };
}
