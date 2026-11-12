/**
 * The review of a card after the reader has drafted it.
 *
 * The reader returns a confidence per cell and `null` for a cell it could not read. This maps that
 * to what the person must look at:
 *
 * - `read`: the reader produced a value and was confident. Still worth a glance, not flagged.
 * - `check`: the value came from the reader but the reader was unsure, or gave no confidence.
 * - `typed`: the reader left the cell empty and a person typed the score.
 * - `changed`: the reader produced a value and a person replaced it.
 * - `blank`: nothing is filled. A cell the reader left empty stays blank until a person types it;
 *   nothing here fills it with par, zero or a guess.
 *
 * `scanReview` is the older confidence-only answer used before the reader returned per-cell values.
 * It is kept, with its tests, and is derived from the same computation.
 */
export const WEAK_CONFIDENCE = 0.9;

export type HoleReview = "ok" | "check" | "blank";

export type ScanCellState = "read" | "check" | "typed" | "changed" | "blank";

/** What the reader returned for one cell. `strokes` is omitted when only confidence is known. */
export interface ScanReaderCell {
  strokes?: number | null;
  confidence: number | null;
}

export interface ScanCellReview {
  state: ScanCellState;
  /** A short word for the cell badge. */
  label: string;
  /** The reader's own value, or null when it left the cell empty. Undefined when unknown. */
  readerStrokes: number | null | undefined;
  confidence: number | null;
}

/** OUT (holes 1 to 9), IN (holes 10 to 18) and TOTAL of the cells that carry a value. */
export interface ScanTotals {
  out: number;
  in: number;
  total: number;
  parOut: number;
  parIn: number;
  parTotal: number;
  /** Strokes over or under par for the filled cells only. */
  toPar: number;
  filled: number;
}

export interface ScanCardReview {
  cells: Record<number, ScanCellReview>;
  filled: number;
  blank: number;
  /** Low-confidence reads that a person has not replaced. */
  check: number;
  /** Cells the reader left empty and a person filled. */
  typed: number;
  /** Cells the reader filled and a person replaced. */
  changed: number;
  blankHoles: number[];
  totals: ScanTotals;
}

const LABELS: Record<ScanCellState, string> = {
  read: "Read",
  check: "Check",
  typed: "Typed",
  changed: "Changed",
  blank: "Empty",
};

function cellState(
  value: string,
  reader: ScanReaderCell | undefined,
): { state: ScanCellState; readerStrokes: number | null | undefined; confidence: number | null } {
  const readerStrokes = reader ? reader.strokes : undefined;
  const confidence = reader?.confidence ?? null;
  if (value === "") return { state: "blank", readerStrokes, confidence };
  const weak = reader !== undefined && (confidence === null || confidence < WEAK_CONFIDENCE);
  if (reader !== undefined && readerStrokes !== undefined) {
    if (readerStrokes === null) return { state: "typed", readerStrokes, confidence };
    const typed = Number(value);
    if (Number.isFinite(typed) && typed !== readerStrokes) {
      return { state: "changed", readerStrokes, confidence };
    }
  }
  return {
    state: weak ? "check" : reader === undefined ? "typed" : "read",
    readerStrokes,
    confidence,
  };
}

/**
 * The full review of one drafted card: every cell's state and the OUT, IN and TOTAL the screen
 * shows while the person corrects cells.
 */
export function reviewScannedCard(
  holes: readonly { number: number; par?: number }[],
  values: Readonly<Record<number, string>>,
  reader: Readonly<Record<number, ScanReaderCell>>,
): ScanCardReview {
  const cells: Record<number, ScanCellReview> = {};
  const blankHoles: number[] = [];
  let filled = 0;
  let blank = 0;
  let check = 0;
  let typed = 0;
  let changed = 0;
  let out = 0;
  let inn = 0;
  let parOut = 0;
  let parIn = 0;

  for (const hole of holes) {
    const value = (values[hole.number] ?? "").trim();
    const computed = cellState(value, reader[hole.number]);
    cells[hole.number] = {
      state: computed.state,
      label: LABELS[computed.state],
      readerStrokes: computed.readerStrokes,
      confidence: computed.confidence,
    };
    if (computed.state === "blank") {
      blank += 1;
      blankHoles.push(hole.number);
      continue;
    }
    filled += 1;
    if (computed.state === "check") check += 1;
    if (computed.state === "typed") typed += 1;
    if (computed.state === "changed") changed += 1;
    const strokes = Number(value);
    if (!Number.isInteger(strokes)) continue;
    if (hole.number < 10) {
      out += strokes;
      parOut += hole.par ?? 0;
    } else {
      inn += strokes;
      parIn += hole.par ?? 0;
    }
  }

  return {
    cells,
    filled,
    blank,
    check,
    typed,
    changed,
    blankHoles,
    totals: {
      out,
      in: inn,
      total: out + inn,
      parOut,
      parIn,
      parTotal: parOut + parIn,
      toPar: out + inn - (parOut + parIn),
      filled,
    },
  };
}

export interface ScanReview {
  holes: Record<number, HoleReview>;
  filled: number;
  blank: number;
  /** Holes the reader drafted with low confidence or did not read at all. */
  weak: number;
}

/**
 * The confidence-only review. A value the reader never produced is not flagged: a hand-typed hole
 * has nothing to doubt. A key with a `null` confidence means the reader returned no value or no
 * score for that cell, so a value beside it still needs a person to confirm it.
 */
export function scanReview(
  holes: readonly { number: number }[],
  strokes: Record<number, string>,
  confidence: Record<number, number | null>,
): ScanReview {
  const reader: Record<number, ScanReaderCell> = {};
  for (const [key, value] of Object.entries(confidence)) {
    const number = Number(key);
    if (Number.isInteger(number)) reader[number] = { confidence: value };
  }
  const review = reviewScannedCard(holes, strokes, reader);
  const legacy: Record<number, HoleReview> = {};
  let weak = 0;
  for (const hole of holes) {
    const state = review.cells[hole.number]?.state ?? "blank";
    const mapped: HoleReview = state === "blank" ? "blank" : state === "check" ? "check" : "ok";
    legacy[hole.number] = mapped;
    if (mapped === "check") weak += 1;
  }
  return { holes: legacy, filled: review.filled, blank: review.blank, weak };
}
