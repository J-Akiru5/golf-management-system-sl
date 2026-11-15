import { capPlayingHandicap, rawCourseHandicap } from "../routing/handicap";
import type {
  HandicapCalculation,
  HandicapInput,
  HandicapProblem,
  HandicapSnapshot,
  HoleDefinition,
  SnapshotRounding,
} from "./types";
import { HANDICAP_INDEX_LIMITS, isIsoDate, isNonEmptyString, teeProblems } from "./validation";

/**
 * The WHS pipeline, kept as four stored values rather than one ambiguous handicap:
 * Handicap Index -> Course Handicap -> allowance -> Playing Handicap.
 *
 * The caller chooses the rounding mode because the club has not confirmed how a non-100%
 * allowance should round. At 100% both modes agree.
 */
export function calculateHandicap(input: HandicapInput): HandicapCalculation {
  const problems: HandicapProblem[] = [];

  if (input.index === null) {
    problems.push({ code: "missing_index", message: "No Handicap Index was supplied." });
  } else if (
    !Number.isFinite(input.index) ||
    input.index < HANDICAP_INDEX_LIMITS.min ||
    input.index > HANDICAP_INDEX_LIMITS.max
  ) {
    problems.push({
      code: "invalid_index",
      message: `The Handicap Index must be between ${HANDICAP_INDEX_LIMITS.min} and ${HANDICAP_INDEX_LIMITS.max}.`,
    });
  }

  if (!isNonEmptyString(input.indexSource)) {
    problems.push({
      code: input.indexSource === null ? "missing_source" : "invalid_source",
      message: "The Handicap Index needs a recorded source.",
    });
  }

  if (input.indexEffectiveDate === null) {
    problems.push({
      code: "missing_effective_date",
      message: "The Handicap Index needs its effective date.",
    });
  } else if (!isIsoDate(input.indexEffectiveDate)) {
    problems.push({
      code: "invalid_effective_date",
      message: "The Handicap Index effective date must be a real ISO date.",
    });
  }

  if (input.tee === null) {
    problems.push({ code: "missing_tee", message: "No tee ratings were supplied." });
  } else {
    for (const message of teeProblems(input.tee)) {
      problems.push({ code: "invalid_tee", message });
    }
  }

  if (input.allowance === null) {
    problems.push({
      code: "missing_allowance",
      message: "The competition allowance has not been supplied.",
    });
  } else if (!Number.isFinite(input.allowance) || input.allowance <= 0 || input.allowance > 1) {
    problems.push({
      code: "invalid_allowance",
      message: "The competition allowance must be a fraction above 0 and at most 1.",
    });
  }

  if (!isNonEmptyString(input.rulesVersion)) {
    problems.push({
      code: "missing_rules_version",
      message: "The handicap rules version must be named.",
    });
  }

  if (problems.length > 0) return { ok: false, problems };

  // TypeScript cannot see that the checks above removed null, so narrow explicitly.
  const index = input.index;
  const tee = input.tee;
  const allowance = input.allowance;
  if (index === null || tee === null || allowance === null) {
    return { ok: false, problems: [{ code: "missing_index", message: "Incomplete handicap." }] };
  }

  const raw = rawCourseHandicap(index, tee);
  const courseHandicap = Math.round(raw);
  // The playing handicap is held to the event maximum: nobody plays off more than it.
  const playingHandicap = capPlayingHandicap(
    input.rounding === "whs" ? Math.round(courseHandicap * allowance) : Math.round(raw * allowance),
    input.playingCap,
  );

  const snapshot: HandicapSnapshot = {
    index,
    indexSource: input.indexSource as string,
    indexEffectiveDate: input.indexEffectiveDate as string,
    teeId: tee.id,
    courseRating: tee.courseRating,
    slope: tee.slope,
    coursePar: tee.par,
    allowance,
    rounding: input.rounding,
    courseHandicap,
    playingHandicap,
    playingCap: input.playingCap ?? null,
    rulesVersion: input.rulesVersion,
  };

  return { ok: true, snapshot };
}

export interface HandicapSnapshotCheck {
  /** The index stored in the round snapshot, or null when the player has no snapshot. */
  snapshotIndex: number | null;
  /** The registration's frozen index, or null when it is not loaded or no index was frozen. */
  frozenIndex: number | null;
  /** True when both indices are known and differ by at least a tenth. */
  indexDiffers: boolean;
  /** True when the snapshot names a tee other than the round's tee. */
  teeDiffers: boolean;
}

/**
 * Compares the round's handicap snapshot with the registration freeze and the round tee.
 *
 * The snapshot is what net scoring uses; this helper only answers "do these two facts agree?"
 * so the desk can check it. A difference is never corrected or hidden here. An index is stored to
 * one decimal, so a real difference is at least 0.1; the small threshold keeps floating-point
 * noise from flagging an identical value.
 *
 * A card snapshot is not compared on its index. `save_card_handicap_snapshot` stores the playing
 * handicap it is handed in the snapshot's index column as well, so that number is not the player's
 * index and comparing the two would raise a difference on every card.
 */
export function checkHandicapSnapshot(input: {
  handicap: (Pick<HandicapSnapshot, "index" | "teeId"> & { rounding?: SnapshotRounding }) | null;
  frozenIndex: number | null | undefined;
  roundTeeId: string | null | undefined;
}): HandicapSnapshotCheck {
  const snapshotIndex = input.handicap?.index ?? null;
  const frozenIndex = input.frozenIndex ?? null;
  const indexDiffers =
    input.handicap?.rounding !== "card" &&
    snapshotIndex !== null &&
    frozenIndex !== null &&
    Math.abs(snapshotIndex - frozenIndex) >= 0.05;
  const teeDiffers = Boolean(
    input.handicap && input.roundTeeId && input.handicap.teeId !== input.roundTeeId,
  );
  return { snapshotIndex, frozenIndex, indexDiffers, teeDiffers };
}

/**
 * Strokes received on one hole.
 *
 * Positive handicaps receive a stroke on the lowest stroke indexes first. Plus handicaps give
 * strokes back from the highest stroke indexes (the easiest holes). A handicap above the number
 * of holes receives a stroke on every hole, plus one more on the hardest holes.
 */
export function handicapStrokesForHole(
  playingHandicap: number,
  strokeIndex: number,
  holes: number,
): number {
  if (!Number.isInteger(playingHandicap)) {
    throw new Error("Playing Handicap must be a whole number.");
  }
  if (!Number.isInteger(holes) || holes < 1) {
    throw new Error("A round must have a positive whole number of holes.");
  }
  if (!Number.isInteger(strokeIndex) || strokeIndex < 1 || strokeIndex > holes) {
    throw new Error(`Stroke index ${strokeIndex} is outside a ${holes}-hole round.`);
  }

  const base = Math.trunc(playingHandicap / holes);
  const remainder = playingHandicap - base * holes;

  let strokes = base;
  if (remainder > 0 && strokeIndex <= remainder) strokes += 1;
  if (remainder < 0 && strokeIndex > holes + remainder) strokes -= 1;
  return strokes === 0 ? 0 : strokes;
}

/** The same allocation, keyed by hole number, for a validated course. */
export function allocateHandicapStrokes(
  playingHandicap: number,
  holes: readonly HoleDefinition[],
): Map<number, number> {
  const allocation = new Map<number, number>();
  for (const hole of holes) {
    allocation.set(
      hole.number,
      handicapStrokesForHole(playingHandicap, hole.strokeIndex, holes.length),
    );
  }
  return allocation;
}
