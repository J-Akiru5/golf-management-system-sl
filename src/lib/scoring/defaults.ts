import type { StrokeLimits, TieBreakPolicy, VerificationPolicy } from "./types";

/**
 * Proposed starting rules. These are not the organizer's confirmed competition rules.
 *
 * They give the next event a sensible starting point without pretending the club has answered.
 * Everything here is stored per round and can be changed. The tie-break policy deliberately has
 * empty confirmation fields, so the finalization gate still refuses to call a result official until
 * the organizer supplies and confirms the written rule.
 */

export type FinalizationAuthority = "owner" | "organizer" | "committee";
export type ScorerRotation = "reciprocal" | "manual";
export type ProvisionalPublication = "off" | "verified_holes";

export interface ProposedScoringRules {
  verification: VerificationPolicy;
  strokeLimits: StrokeLimits;
  tieBreak: TieBreakPolicy;
  finalizationAuthority: FinalizationAuthority;
  provisionalPublication: ProvisionalPublication;
  scorerRotation: ScorerRotation;
  allowance: number;
  rounding: "whs" | "single";
  /** Each daily competition is independent unless the organizer says otherwise. */
  multiDayEligibility: "independent";
}

export const PROPOSED_SCORING_RULES: ProposedScoringRules = {
  verification: {
    requiredCards: 2,
    allowProvisionalSingleCard: true,
    minOcrConfidence: 0.85,
  },
  strokeLimits: { min: 1, max: 20 },
  tieBreak: {
    id: "proposed-back-9",
    name: "Back 9, then back 6, then back 3, then the last hole",
    source: "Proposed default. Replace it with the organizer's written rule.",
    confirmedBy: "",
    confirmedAt: "",
  },
  finalizationAuthority: "organizer",
  provisionalPublication: "verified_holes",
  scorerRotation: "reciprocal",
  allowance: 1,
  rounding: "whs",
  multiDayEligibility: "independent",
};

/**
 * A reciprocal rotation for a group: each player marks the next player, and the last marks the
 * first. One marker per player, so it fits the scorer assignment rule. Manual assignment is the
 * other supported policy.
 */
export function reciprocalRotation(
  playerIds: readonly string[],
): Array<{ playerId: string; scorerId: string }> {
  const ids = playerIds.filter((id) => id.trim() !== "");
  if (ids.length < 2) return [];
  return ids.map((playerId, index) => ({
    playerId,
    scorerId: ids[(index + 1) % ids.length] as string,
  }));
}
