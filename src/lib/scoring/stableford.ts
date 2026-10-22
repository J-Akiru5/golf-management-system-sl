import { allocateHandicapStrokes } from "./handicap";
import type {
  HandicapSnapshot,
  HoleDefinition,
  HoleScore,
  RoundCourse,
  RoundScoring,
  RoundScoringResult,
  ScoredHole,
  ScoringProblem,
  StrokeLimits,
} from "./types";
import {
  DEFAULT_STROKE_LIMITS,
  handicapSnapshotProblems,
  isValidStrokes,
  strokeLimitsProblems,
  validateCourseSetup,
} from "./validation";

export interface ScoreRoundInput {
  course: RoundCourse;
  scores: readonly HoleScore[];
  handicap: HandicapSnapshot | null;
  strokeLimits?: StrokeLimits;
  /** Defaults to true. Provisional boards pass false to score the verified holes only. */
  requireComplete?: boolean;
}

/** Conventional Stableford points for one hole. Negative results are capped at zero. */
export function stablefordPoints(par: number, strokes: number): number {
  return Math.max(0, 2 + par - strokes);
}

/**
 * Scores gross and net Stableford from approved gross hole scores.
 *
 * Gross points only need valid pars. Net points additionally need a complete handicap snapshot
 * taken on the same tee; without one the gross result is returned and net is marked unavailable.
 * A missing snapshot is expected, but an inconsistent one is reported as a warning.
 */
export function scoreRound(input: ScoreRoundInput): RoundScoringResult {
  const limits = input.strokeLimits ?? DEFAULT_STROKE_LIMITS;
  const problems: ScoringProblem[] = [];

  for (const message of strokeLimitsProblems(limits)) {
    problems.push({ code: "invalid_stroke_limits", hole: null, message });
  }
  for (const problem of validateCourseSetup(input.course)) {
    problems.push({ code: "invalid_course", hole: problem.hole, message: problem.message });
  }
  if (problems.length > 0) return { ok: false, problems };

  const byHole = new Map<number, HoleDefinition>();
  for (const hole of input.course.holes) byHole.set(hole.number, hole);

  const seen = new Set<number>();
  const ordered: Array<{ hole: HoleDefinition; gross: number }> = [];

  for (const score of input.scores) {
    const hole = byHole.get(score.hole);
    if (!hole) {
      problems.push({
        code: "unknown_hole",
        hole: score.hole,
        message: `Hole ${score.hole} is not part of this round.`,
      });
      continue;
    }
    if (seen.has(score.hole)) {
      problems.push({
        code: "duplicate_hole",
        hole: score.hole,
        message: `Hole ${score.hole} has more than one score.`,
      });
      continue;
    }
    seen.add(score.hole);

    if (!isValidStrokes(score.grossStrokes, limits)) {
      problems.push({
        code: "invalid_strokes",
        hole: score.hole,
        message: `Hole ${score.hole} needs a whole-number score between ${limits.min} and ${limits.max}.`,
      });
      continue;
    }
    ordered.push({ hole, gross: score.grossStrokes });
  }

  if (input.requireComplete ?? true) {
    for (const hole of input.course.holes) {
      if (!seen.has(hole.number)) {
        problems.push({
          code: "missing_hole",
          hole: hole.number,
          message: `Hole ${hole.number} has no score.`,
        });
      }
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  const warnings: ScoringProblem[] = [];
  let allocation: Map<number, number> | null = null;

  if (input.handicap) {
    const snapshotIssues = handicapSnapshotProblems(input.handicap);
    if (input.handicap.teeId !== input.course.tee.id) {
      snapshotIssues.push("The handicap snapshot was taken on a different tee.");
    }
    if (snapshotIssues.length > 0) {
      warnings.push({
        code: "handicap_mismatch",
        hole: null,
        message: snapshotIssues.join(" "),
      });
    } else {
      allocation = allocateHandicapStrokes(input.handicap.playingHandicap, input.course.holes);
    }
  }

  ordered.sort((a, b) => a.hole.number - b.hole.number);

  const holes: ScoredHole[] = ordered.map(({ hole, gross }) => {
    const handicapStrokes = allocation?.get(hole.number) ?? null;
    const netStrokes = handicapStrokes === null ? null : gross - handicapStrokes;
    return {
      hole: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      grossStrokes: gross,
      handicapStrokes,
      netStrokes,
      grossPoints: stablefordPoints(hole.par, gross),
      netPoints: netStrokes === null ? null : stablefordPoints(hole.par, netStrokes),
    };
  });

  const grossStrokes = holes.reduce((total, hole) => total + hole.grossStrokes, 0);
  const grossPoints = holes.reduce((total, hole) => total + hole.grossPoints, 0);
  const netStrokes =
    allocation === null ? null : holes.reduce((total, hole) => total + (hole.netStrokes ?? 0), 0);
  const netPoints =
    allocation === null ? null : holes.reduce((total, hole) => total + (hole.netPoints ?? 0), 0);

  const result: RoundScoring = {
    holes,
    totalHoles: input.course.holes.length,
    holesCompleted: holes.length,
    grossStrokes,
    grossPoints,
    netStrokes,
    netPoints,
    netStatus: allocation === null ? "unavailable" : "calculated",
  };

  return { ok: true, result, warnings };
}
