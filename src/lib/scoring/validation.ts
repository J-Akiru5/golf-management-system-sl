import { capPlayingHandicap } from "../routing/handicap";
import type {
  HandicapSnapshot,
  PolicyProblem,
  RoundCourse,
  StrokeLimits,
  TeeRatings,
  VerificationPolicy,
} from "./types";

/**
 * A technical sanity bound, not a competition rule. A score outside this range is far more
 * likely to be a transcription error than a real hole score, and the event can widen it.
 */
export const DEFAULT_STROKE_LIMITS: StrokeLimits = { min: 1, max: 20 };

/**
 * Safe starting configuration while the organizer has not confirmed the required card count.
 * A null count means no hole can be verified, and single-card provisional display is off, so
 * finalization is blocked and nothing is published until the rules are supplied.
 */
export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  requiredCards: null,
  allowProvisionalSingleCard: false,
  minOcrConfidence: 0.85,
};

/**
 * WHS Handicap Index is capped at 54.0. The lower bound is a sanity floor for plus handicaps,
 * not a rule the club has confirmed.
 */
export const HANDICAP_INDEX_LIMITS = { min: -20, max: 54 } as const;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type CourseProblemCode =
  | "invalid_round"
  | "invalid_tee"
  | "no_holes"
  | "invalid_hole"
  | "duplicate_hole"
  | "hole_sequence"
  | "invalid_par"
  | "duplicate_stroke_index"
  | "stroke_index_sequence"
  | "invalid_stroke_index"
  | "par_total_mismatch";

export interface CourseProblem {
  code: CourseProblemCode;
  hole: number | null;
  message: string;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function strokeLimitsProblems(limits: StrokeLimits): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(limits.min) || limits.min < 1) {
    problems.push("Stroke limit minimum must be a positive whole number.");
  }
  if (!Number.isInteger(limits.max) || limits.max < 1) {
    problems.push("Stroke limit maximum must be a positive whole number.");
  }
  if (limits.max < limits.min) {
    problems.push("Stroke limit maximum cannot be below the minimum.");
  }
  return problems;
}

export function isValidStrokes(strokes: unknown, limits: StrokeLimits): strokes is number {
  return (
    typeof strokes === "number" &&
    Number.isInteger(strokes) &&
    strokes >= limits.min &&
    strokes <= limits.max
  );
}

export function teeProblems(tee: TeeRatings | null): string[] {
  if (!tee) return ["No tee is configured for the round."];
  const problems: string[] = [];
  if (!isNonEmptyString(tee.id)) problems.push("The tee has no identity.");
  if (!Number.isFinite(tee.courseRating) || tee.courseRating < 50 || tee.courseRating > 90) {
    problems.push("Course Rating must be between 50 and 90.");
  }
  if (!Number.isInteger(tee.slope) || tee.slope < 55 || tee.slope > 155) {
    problems.push("Slope must be a whole number between 55 and 155.");
  }
  if (!Number.isInteger(tee.par) || tee.par < 27 || tee.par > 80) {
    problems.push("Tee par must be a whole number between 27 and 80.");
  }
  return problems;
}

/**
 * Checks the course before any score is calculated: unique hole numbers and stroke indexes,
 * a complete 1..N sequence, valid pars, a valid tee, and pars that add up to the tee par.
 */
export function validateCourseSetup(course: RoundCourse): CourseProblem[] {
  const problems: CourseProblem[] = [];
  if (!isNonEmptyString(course.roundId)) {
    problems.push({ code: "invalid_round", hole: null, message: "The round has no identity." });
  }

  for (const message of teeProblems(course.tee)) {
    problems.push({ code: "invalid_tee", hole: null, message });
  }

  const holes = course.holes;
  if (holes.length === 0) {
    problems.push({ code: "no_holes", hole: null, message: "The course has no holes." });
    return problems;
  }

  const holeNumbers = new Set<number>();
  const strokeIndexes = new Set<number>();
  let parTotal = 0;

  for (const hole of holes) {
    if (!Number.isInteger(hole.number) || hole.number < 1) {
      problems.push({
        code: "invalid_hole",
        hole: null,
        message: `Hole ${hole.number} has an invalid number.`,
      });
      continue;
    }
    if (holeNumbers.has(hole.number)) {
      problems.push({
        code: "duplicate_hole",
        hole: hole.number,
        message: `Hole ${hole.number} appears more than once.`,
      });
    }
    holeNumbers.add(hole.number);

    if (!Number.isInteger(hole.par) || hole.par < 3 || hole.par > 6) {
      problems.push({
        code: "invalid_par",
        hole: hole.number,
        message: `Hole ${hole.number} must have a par between 3 and 6.`,
      });
    } else {
      parTotal += hole.par;
    }

    if (!Number.isInteger(hole.strokeIndex) || hole.strokeIndex < 1) {
      problems.push({
        code: "invalid_stroke_index",
        hole: hole.number,
        message: `Hole ${hole.number} has an invalid stroke index.`,
      });
      continue;
    }
    if (strokeIndexes.has(hole.strokeIndex)) {
      problems.push({
        code: "duplicate_stroke_index",
        hole: hole.number,
        message: `Stroke index ${hole.strokeIndex} is used by more than one hole.`,
      });
    }
    strokeIndexes.add(hole.strokeIndex);
  }

  for (let number = 1; number <= holes.length; number += 1) {
    if (!holeNumbers.has(number)) {
      problems.push({
        code: "hole_sequence",
        hole: number,
        message: `Hole ${number} is missing from the course.`,
      });
    }
    if (!strokeIndexes.has(number)) {
      problems.push({
        code: "stroke_index_sequence",
        hole: null,
        message: `Stroke index ${number} is missing from the course.`,
      });
    }
  }

  for (const index of strokeIndexes) {
    if (index > holes.length) {
      problems.push({
        code: "stroke_index_sequence",
        hole: null,
        message: `Stroke index ${index} is outside the ${holes.length}-hole round.`,
      });
    }
  }

  if (problems.length === 0 && parTotal !== course.tee.par) {
    problems.push({
      code: "par_total_mismatch",
      hole: null,
      message: `The holes add up to par ${parTotal}, but the tee par is ${course.tee.par}.`,
    });
  }

  return problems;
}

export function validateVerificationPolicy(policy: VerificationPolicy): PolicyProblem[] {
  const problems: PolicyProblem[] = [];
  if (policy.requiredCards !== null) {
    if (!Number.isInteger(policy.requiredCards) || policy.requiredCards < 1) {
      problems.push({
        field: "requiredCards",
        message: "Required cards must be a positive whole number, or null while unconfirmed.",
      });
    }
  }
  if (typeof policy.allowProvisionalSingleCard !== "boolean") {
    problems.push({
      field: "allowProvisionalSingleCard",
      message: "The single-card provisional rule must be true or false.",
    });
  }
  if (
    !Number.isFinite(policy.minOcrConfidence) ||
    policy.minOcrConfidence < 0 ||
    policy.minOcrConfidence > 1
  ) {
    problems.push({
      field: "minOcrConfidence",
      message: "The OCR confidence threshold must be between 0 and 1.",
    });
  }
  return problems;
}

/**
 * A stored snapshot must still add up. This catches a hand-edited row or a snapshot taken with a
 * different rounding mode before it can produce a net result.
 */
export function handicapSnapshotProblems(snapshot: HandicapSnapshot): string[] {
  const problems: string[] = [];
  if (
    !Number.isFinite(snapshot.index) ||
    snapshot.index < HANDICAP_INDEX_LIMITS.min ||
    snapshot.index > HANDICAP_INDEX_LIMITS.max
  ) {
    problems.push("The snapshot index is outside the WHS range.");
  }
  if (!isNonEmptyString(snapshot.indexSource)) problems.push("The snapshot has no index source.");
  if (!isIsoDate(snapshot.indexEffectiveDate)) {
    problems.push("The snapshot index date is not a valid ISO date.");
  }
  if (!isNonEmptyString(snapshot.teeId)) problems.push("The snapshot has no tee.");
  if (
    !Number.isFinite(snapshot.courseRating) ||
    snapshot.courseRating < 50 ||
    snapshot.courseRating > 90
  ) {
    problems.push("The snapshot Course Rating is outside the course limits.");
  }
  if (!Number.isInteger(snapshot.slope) || snapshot.slope < 55 || snapshot.slope > 155) {
    problems.push("The snapshot Slope is outside the course limits.");
  }
  if (!Number.isInteger(snapshot.coursePar) || snapshot.coursePar < 27 || snapshot.coursePar > 80) {
    problems.push("The snapshot par is outside the course limits.");
  }
  if (!Number.isFinite(snapshot.allowance) || snapshot.allowance <= 0 || snapshot.allowance > 1) {
    problems.push("The snapshot allowance is not a fraction above 0 and at most 1.");
  }
  if (
    snapshot.rounding !== "whs" &&
    snapshot.rounding !== "single" &&
    snapshot.rounding !== "card"
  ) {
    problems.push("The snapshot does not name a known rounding mode.");
  }
  if (!Number.isInteger(snapshot.courseHandicap)) {
    problems.push("The snapshot Course Handicap is not a whole number.");
  }
  if (!Number.isInteger(snapshot.playingHandicap)) {
    problems.push("The snapshot Playing Handicap is not a whole number.");
  }
  if (!isNonEmptyString(snapshot.rulesVersion)) {
    problems.push("The snapshot does not name the rules version it used.");
  }

  if (problems.length > 0) return problems;

  if (snapshot.rounding === "card") {
    // The event rule: the handicap on the card with the decimal dropped is the playing handicap.
    // Nothing is worked out from the tee, so there is no slope or rating to compare against.
    if (snapshot.playingHandicap !== Math.floor(snapshot.index)) {
      problems.push(
        "The snapshot Playing Handicap is not the card handicap with the decimal dropped.",
      );
    }
    if (snapshot.courseHandicap !== snapshot.playingHandicap) {
      problems.push("A card handicap snapshot must carry the same Course and Playing Handicap.");
    }
    if (snapshot.allowance !== 1) {
      problems.push("A card handicap snapshot is played at a full allowance.");
    }
    return problems;
  }

  const raw =
    snapshot.index * (snapshot.slope / 113) + (snapshot.courseRating - snapshot.coursePar);
  const expectedCourse = Math.round(raw);
  // A capped snapshot holds the event maximum, not the tee formula's figure, so the check works out
  // the same capped number or it would read a correct snapshot as a mismatch and drop its net score.
  const expectedPlaying = capPlayingHandicap(
    snapshot.rounding === "whs"
      ? Math.round(expectedCourse * snapshot.allowance)
      : Math.round(raw * snapshot.allowance),
    snapshot.playingCap,
  );

  if (expectedCourse !== snapshot.courseHandicap) {
    problems.push("The snapshot Course Handicap does not match its inputs.");
  }
  if (expectedPlaying !== snapshot.playingHandicap) {
    problems.push("The snapshot Playing Handicap does not match its inputs.");
  }
  return problems;
}
