import type {
  CardEntry,
  CardIssue,
  CardValidation,
  RoundCourse,
  Scorecard,
  StrokeLimits,
} from "./types";
import {
  DEFAULT_STROKE_LIMITS,
  isNonEmptyString,
  isValidStrokes,
  strokeLimitsProblems,
} from "./validation";

export interface ScorecardValidationInput {
  course: RoundCourse;
  strokeLimits?: StrokeLimits;
  /** The verification policy's OCR threshold. A value below it needs manual confirmation. */
  minOcrConfidence: number;
}

/**
 * Validates one card revision before the desk can approve it. Every capture path, whether
 * webcam, upload or manual entry, passes through this same function.
 *
 * Low confidence is a review item, never a correction: the extracted value is kept as it was
 * read, and a person must confirm it against the paper card.
 */
export function validateScorecard(
  card: Scorecard,
  input: ScorecardValidationInput,
): CardValidation {
  const limits = input.strokeLimits ?? DEFAULT_STROKE_LIMITS;
  const issues: CardIssue[] = [];

  if (!Number.isInteger(card.revision) || card.revision < 1) {
    issues.push({
      code: "invalid_revision",
      severity: "blocking",
      hole: null,
      message: "The card revision must be a positive whole number.",
    });
  }

  if (!isNonEmptyString(card.playerId) || !isNonEmptyString(card.scorerId)) {
    issues.push({
      code: "self_scored",
      severity: "blocking",
      hole: null,
      message: "The card needs both a player and an assigned scorer.",
    });
  } else if (card.playerId === card.scorerId) {
    issues.push({
      code: "self_scored",
      severity: "blocking",
      hole: null,
      message: "A player cannot mark their own card.",
    });
  }

  if (card.roundId !== input.course.roundId) {
    issues.push({
      code: "wrong_round",
      severity: "blocking",
      hole: null,
      message: "The card belongs to a different daily round.",
    });
  }

  for (const message of strokeLimitsProblems(limits)) {
    issues.push({
      code: "invalid_stroke_limits",
      severity: "blocking",
      hole: null,
      message,
    });
  }

  const thresholdIsValid =
    Number.isFinite(input.minOcrConfidence) &&
    input.minOcrConfidence >= 0 &&
    input.minOcrConfidence <= 1;
  if (!thresholdIsValid) {
    issues.push({
      code: "invalid_confidence",
      severity: "blocking",
      hole: null,
      message: "The OCR confidence threshold is not a fraction between 0 and 1.",
    });
  }

  const byHole = new Map<number, CardEntry>();
  for (const entry of card.entries) {
    if (!isKnownHole(input.course, entry.hole)) {
      issues.push({
        code: "unknown_hole",
        severity: "blocking",
        hole: entry.hole,
        message: `Hole ${entry.hole} is not part of this round.`,
      });
      continue;
    }
    if (byHole.has(entry.hole)) {
      issues.push({
        code: "duplicate_hole",
        severity: "blocking",
        hole: entry.hole,
        message: `Hole ${entry.hole} appears more than once on the card.`,
      });
      continue;
    }
    byHole.set(entry.hole, entry);

    if (entry.confidence !== null) {
      if (!Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) {
        issues.push({
          code: "invalid_confidence",
          severity: "blocking",
          hole: entry.hole,
          message: `Hole ${entry.hole} has an impossible confidence value.`,
        });
      } else if (thresholdIsValid && entry.confidence < input.minOcrConfidence) {
        if (!entry.manuallyConfirmed) {
          issues.push({
            code: "low_confidence",
            severity: "review",
            hole: entry.hole,
            message: `Hole ${entry.hole} was read at ${Math.round(entry.confidence * 100)}% confidence and needs a person to confirm it.`,
          });
        }
      }
    } else if (!entry.manuallyConfirmed) {
      issues.push({
        code: "low_confidence",
        severity: "review",
        hole: entry.hole,
        message: `Hole ${entry.hole} has no confidence value and has not been confirmed against the card.`,
      });
    }

    if (entry.pickedUp === true) {
      // A pick-up is filled by the X. It cannot also carry a stroke count.
      if (entry.strokes !== null) {
        issues.push({
          code: "invalid_strokes",
          severity: "blocking",
          hole: entry.hole,
          message: `Hole ${entry.hole} is marked as a pick-up, so it cannot also carry a score.`,
        });
      }
    } else if (entry.strokes === null) {
      issues.push({
        code: "missing_hole",
        severity: "review",
        hole: entry.hole,
        message: `Hole ${entry.hole} is blank or illegible.`,
      });
    } else if (!isValidStrokes(entry.strokes, limits)) {
      issues.push({
        code: "invalid_strokes",
        severity: "blocking",
        hole: entry.hole,
        message: `Hole ${entry.hole} needs a whole-number score between ${limits.min} and ${limits.max}.`,
      });
    }
  }

  for (const hole of input.course.holes) {
    if (!byHole.has(hole.number)) {
      issues.push({
        code: "missing_hole",
        severity: "blocking",
        hole: hole.number,
        message: `Hole ${hole.number} is not on the card.`,
      });
    }
  }

  const completeEntries = input.course.holes.every((hole) => {
    const entry = byHole.get(hole.number);
    return entry !== undefined && (entry.strokes !== null || entry.pickedUp === true);
  });

  // A pick-up has no stroke count, so the holes on such a card cannot add up to a written total.
  const hasPickup = card.entries.some((entry) => entry.pickedUp === true);

  if (card.writtenTotal === null) {
    issues.push({
      code: "written_total_missing",
      severity: "warning",
      hole: null,
      message: "The card has no written total to check against.",
    });
  } else if (!Number.isInteger(card.writtenTotal) || card.writtenTotal < 1) {
    issues.push({
      code: "written_total_mismatch",
      severity: "blocking",
      hole: null,
      message: "The written total is not a positive whole number.",
    });
  } else if (completeEntries && !hasPickup) {
    const sum = input.course.holes.reduce((total, hole) => {
      const entry = byHole.get(hole.number);
      if (entry?.pickedUp === true) return total;
      return total + (entry?.strokes ?? 0);
    }, 0);
    if (sum !== card.writtenTotal) {
      issues.push({
        code: "written_total_mismatch",
        severity: "blocking",
        hole: null,
        message: `The written total is ${card.writtenTotal}, but the holes add up to ${sum}.`,
      });
    }
  }

  return {
    approvable: issues.every((issue) => issue.severity === "warning"),
    issues,
  };
}

function isKnownHole(course: RoundCourse, number: number): boolean {
  return course.holes.some((hole) => hole.number === number);
}
