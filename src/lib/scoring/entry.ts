import { PROPOSED_SCORING_RULES } from "./defaults";
import type { CardEntry, HoleDefinition } from "./types";

/**
 * Reads the desk's hole inputs as a scorecard draft.
 *
 * A blank cell is not zero and is not par: the card is incomplete until every hole carries a whole
 * score inside the permitted limits. The written total is derived from the same cells and is only
 * returned once all of them are usable, so a partly filled card never claims a total.
 */
export interface ParsedCardEntry {
  /** One entry per hole, in course order. A missing or invalid hole carries null strokes. */
  entries: CardEntry[];
  /** Holes with no value typed. */
  blankHoles: number[];
  /** Holes with a value that is not a whole score inside the permitted limits. */
  invalidHoles: number[];
  /** The sum of the cells, or null while any hole is blank or invalid. */
  writtenTotal: number | null;
}

export function parseCardEntry(
  holes: readonly Pick<HoleDefinition, "number">[],
  strokes: Readonly<Record<number, string>>,
): ParsedCardEntry {
  const { min, max } = PROPOSED_SCORING_RULES.strokeLimits;
  const entries: CardEntry[] = [];
  const blankHoles: number[] = [];
  const invalidHoles: number[] = [];

  for (const hole of holes) {
    const raw = (strokes[hole.number] ?? "").trim();
    if (raw === "") {
      blankHoles.push(hole.number);
      entries.push({
        hole: hole.number,
        strokes: null,
        confidence: null,
        manuallyConfirmed: true,
      });
      continue;
    }

    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      invalidHoles.push(hole.number);
      entries.push({
        hole: hole.number,
        strokes: null,
        confidence: null,
        manuallyConfirmed: true,
      });
      continue;
    }

    entries.push({
      hole: hole.number,
      strokes: value,
      confidence: null,
      manuallyConfirmed: true,
    });
  }

  const complete = holes.length > 0 && blankHoles.length === 0 && invalidHoles.length === 0;
  return {
    entries,
    blankHoles,
    invalidHoles,
    writtenTotal: complete
      ? entries.reduce((total, entry) => total + (entry.strokes ?? 0), 0)
      : null,
  };
}
