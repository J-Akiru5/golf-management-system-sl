import type {
  CanonicalHole,
  CanonicalProblem,
  CanonicalRound,
  CardEntry,
  Resolution,
  RoundCourse,
  Scorecard,
  StrokeLimits,
  VerificationPolicy,
} from "./types";
import {
  DEFAULT_STROKE_LIMITS,
  isIsoDate,
  isNonEmptyString,
  isValidStrokes,
  strokeLimitsProblems,
  validateCourseSetup,
  validateVerificationPolicy,
} from "./validation";

export interface CanonicalInput {
  roundId: string;
  playerId: string;
  course: RoundCourse;
  /** Every card supplied for this player, including cards that are not approved yet. */
  cards: readonly Scorecard[];
  /** The desk's decisions, including superseded ones. The latest per hole wins. */
  resolutions?: readonly Resolution[];
  policy: VerificationPolicy;
  strokeLimits?: StrokeLimits;
}

interface Evidence {
  cardId: string;
  scorerId: string;
  strokes: number;
}

/**
 * Derives the canonical hole scores from independent evidence.
 *
 * It never chooses a value by majority, first card or last card. Cards that agree can verify a
 * hole only when the configured number of independent cards is present; any disagreement is a
 * conflict that the operations desk must resolve with a reason. A resolution is the only way a
 * disputed value becomes canonical.
 */
export function deriveCanonicalHoleScores(input: CanonicalInput): CanonicalRound {
  const limits = input.strokeLimits ?? DEFAULT_STROKE_LIMITS;
  const setupProblems: CanonicalProblem[] = [];

  if (input.course.roundId !== input.roundId) {
    setupProblems.push({
      code: "invalid_course",
      hole: null,
      message: "The course belongs to a different daily round.",
    });
  }
  for (const problem of validateCourseSetup(input.course)) {
    setupProblems.push({ code: "invalid_course", hole: problem.hole, message: problem.message });
  }
  for (const problem of validateVerificationPolicy(input.policy)) {
    setupProblems.push({ code: "invalid_policy", hole: null, message: problem.message });
  }
  for (const message of strokeLimitsProblems(limits)) {
    setupProblems.push({ code: "invalid_stroke_limits", hole: null, message });
  }

  // Fail closed: a broken course or policy cannot verify anything, even if some cards agree.
  if (setupProblems.length > 0) {
    return {
      roundId: input.roundId,
      playerId: input.playerId,
      holes: [],
      counts: { verified: 0, provisional: 0, conflict: 0, pending: 0 },
      complete: false,
      problems: setupProblems,
    };
  }

  const problems: CanonicalProblem[] = [];
  const currentCards = selectCurrentCards(input, problems);
  if (currentCards.length === 0) {
    problems.push({
      code: "no_approved_cards",
      hole: null,
      message: "No approved card carries usable evidence for this player.",
    });
  }
  const resolutions = latestResolutions(input, limits, problems);

  const holes: CanonicalHole[] = input.course.holes
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((hole) => {
      const resolution = resolutions.get(hole.number);
      if (resolution) {
        return {
          hole: hole.number,
          status: "verified",
          strokes: resolution.strokes,
          provenance: "desk_resolution",
          evidenceCardIds: [...resolution.evidenceCardIds],
          note: `Resolved by ${resolution.resolvedBy}: ${resolution.reason}`,
        };
      }

      const evidence: Evidence[] = [];
      for (const card of currentCards) {
        const entry = card.entries.find((candidate) => candidate.hole === hole.number);
        if (!entry || entry.strokes === null) continue;

        if (!isValidStrokes(entry.strokes, limits)) {
          problems.push({
            code: "invalid_card_entry",
            hole: hole.number,
            message: `Card ${card.id} carries an invalid score on hole ${hole.number}.`,
          });
          continue;
        }
        if (!entryCounts(entry, input.policy.minOcrConfidence)) {
          problems.push({
            code: "low_confidence_entry",
            hole: hole.number,
            message: `Card ${card.id} has an unconfirmed value on hole ${hole.number}, so it was not used as evidence.`,
          });
          continue;
        }
        evidence.push({ cardId: card.id, scorerId: card.scorerId, strokes: entry.strokes });
      }

      if (evidence.length === 0) {
        return {
          hole: hole.number,
          status: "pending",
          strokes: null,
          provenance: null,
          evidenceCardIds: [],
          note: "No usable evidence for this hole.",
        };
      }

      const distinctValues = new Set(evidence.map((item) => item.strokes));
      if (distinctValues.size > 1) {
        return {
          hole: hole.number,
          status: "conflict",
          strokes: null,
          provenance: null,
          evidenceCardIds: evidence.map((item) => item.cardId),
          note: `Cards disagree: ${evidence
            .map((item) => `${item.strokes} on ${item.cardId}`)
            .join(", ")}.`,
        };
      }

      const strokes = evidence[0]?.strokes;
      if (strokes === undefined) {
        return {
          hole: hole.number,
          status: "pending",
          strokes: null,
          provenance: null,
          evidenceCardIds: [],
          note: "No usable evidence for this hole.",
        };
      }
      const independentCards = new Set(evidence.map((item) => item.scorerId)).size;
      const required = input.policy.requiredCards;
      const provenance = independentCards === 1 ? "single_card" : "agreement";

      if (required !== null && independentCards >= required) {
        return {
          hole: hole.number,
          status: "verified",
          strokes,
          provenance,
          evidenceCardIds: evidence.map((item) => item.cardId),
          note: null,
        };
      }

      if (input.policy.allowProvisionalSingleCard) {
        return {
          hole: hole.number,
          status: "provisional",
          strokes,
          provenance,
          evidenceCardIds: evidence.map((item) => item.cardId),
          note:
            required === null
              ? "The required card count is not confirmed."
              : `Requires ${required} independent cards; ${independentCards} present.`,
        };
      }

      return {
        hole: hole.number,
        status: "pending",
        strokes: null,
        provenance: null,
        evidenceCardIds: evidence.map((item) => item.cardId),
        note:
          required === null
            ? "The required card count is not confirmed."
            : `Requires ${required} independent cards; ${independentCards} present.`,
      };
    });

  const counts = {
    verified: holes.filter((hole) => hole.status === "verified").length,
    provisional: holes.filter((hole) => hole.status === "provisional").length,
    conflict: holes.filter((hole) => hole.status === "conflict").length,
    pending: holes.filter((hole) => hole.status === "pending").length,
  };

  return {
    roundId: input.roundId,
    playerId: input.playerId,
    holes,
    counts,
    complete: holes.length > 0 && counts.verified === holes.length,
    problems,
  };
}

/**
 * One current card per scorer: the highest approved revision. Two cards claiming the same
 * scorer and revision are ambiguous and that scorer's evidence is dropped rather than guessed.
 */
function selectCurrentCards(input: CanonicalInput, problems: CanonicalProblem[]): Scorecard[] {
  const eligible: Scorecard[] = [];

  for (const card of input.cards) {
    if (card.roundId !== input.roundId) {
      problems.push({
        code: "wrong_round_card",
        hole: null,
        message: `Card ${card.id} belongs to another daily round.`,
      });
      continue;
    }
    if (card.playerId !== input.playerId) {
      problems.push({
        code: "wrong_player_card",
        hole: null,
        message: `Card ${card.id} belongs to another player.`,
      });
      continue;
    }
    if (card.status !== "approved") continue;
    if (card.scorerId === card.playerId) {
      problems.push({
        code: "self_scored_card",
        hole: null,
        message: `Card ${card.id} was marked by the player and cannot count.`,
      });
      continue;
    }
    eligible.push(card);
  }

  const byScorer = new Map<string, Scorecard[]>();
  for (const card of eligible) {
    const group = byScorer.get(card.scorerId) ?? [];
    group.push(card);
    byScorer.set(card.scorerId, group);
  }

  const current: Scorecard[] = [];
  for (const [scorerId, cards] of byScorer) {
    const sorted = [...cards].sort(
      (a, b) =>
        b.revision - a.revision ||
        b.submittedAt.localeCompare(a.submittedAt) ||
        a.id.localeCompare(b.id),
    );
    const first = sorted[0];
    const second = sorted[1];
    if (!first) continue;
    if (second && second.revision === first.revision) {
      problems.push({
        code: "duplicate_card_revision",
        hole: null,
        message: `Scorer ${scorerId} has more than one card at revision ${first.revision}; none of them is used.`,
      });
      continue;
    }
    current.push(first);
  }

  return current.sort((a, b) => a.scorerId.localeCompare(b.scorerId));
}

function latestResolutions(
  input: CanonicalInput,
  limits: StrokeLimits,
  problems: CanonicalProblem[],
): Map<number, Resolution> {
  const latest = new Map<number, Resolution>();

  for (const resolution of input.resolutions ?? []) {
    if (resolution.roundId !== input.roundId || resolution.playerId !== input.playerId) continue;

    const knownHole = input.course.holes.some((hole) => hole.number === resolution.hole);
    const invalid =
      !knownHole ||
      !isValidStrokes(resolution.strokes, limits) ||
      !isNonEmptyString(resolution.reason) ||
      !isNonEmptyString(resolution.resolvedBy) ||
      !isIsoDate(resolution.resolvedAt.slice(0, 10));

    if (invalid) {
      problems.push({
        code: "invalid_resolution",
        hole: resolution.hole,
        message: `Resolution ${resolution.id} is incomplete or outside the allowed score range, so it was ignored.`,
      });
      continue;
    }

    const current = latest.get(resolution.hole);
    if (
      !current ||
      resolution.resolvedAt > current.resolvedAt ||
      (resolution.resolvedAt === current.resolvedAt && resolution.id > current.id)
    ) {
      latest.set(resolution.hole, resolution);
    }
  }

  return latest;
}

function entryCounts(entry: CardEntry, minOcrConfidence: number): boolean {
  if (entry.manuallyConfirmed) return true;
  if (entry.confidence === null) return false;
  return entry.confidence >= minOcrConfidence;
}
