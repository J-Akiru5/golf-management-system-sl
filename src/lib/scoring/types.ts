/**
 * Scoring domain types.
 *
 * These types describe evidence and calculations. Competition rules arrive as configuration:
 * card counts, allowances, rounding and tie-break rules are never constants here.
 *
 * Two integrity rules are universal and therefore encoded:
 * - A player never marks their own card.
 * - A score is only final when the tournament's configuration says it is verified.
 */

export interface HoleDefinition {
  number: number;
  par: number;
  /** 1 is the hardest hole. Every hole in a round has a distinct stroke index. */
  strokeIndex: number;
}

export interface TeeRatings {
  id: string;
  name: string;
  courseRating: number;
  slope: number;
  par: number;
}

export interface RoundCourse {
  roundId: string;
  tee: TeeRatings;
  holes: readonly HoleDefinition[];
}

/** Technical guard against a mistyped score, not a competition rule. Override per event. */
export interface StrokeLimits {
  min: number;
  max: number;
}

export type HandicapRounding = "whs" | "single";

export interface HandicapInput {
  index: number | null;
  /** Where the index came from, for example an NGAP export batch id. */
  indexSource: string | null;
  /** The effective date of the index record, ISO YYYY-MM-DD. */
  indexEffectiveDate: string | null;
  tee: TeeRatings | null;
  /** Competition allowance as a fraction: 0.95 means 95%. */
  allowance: number | null;
  /**
   * "whs": round the Course Handicap, then apply the allowance and round the Playing Handicap.
   * "single": round the raw course handicap multiplied by the allowance once at the end.
   * At a 100% allowance both modes produce the same Playing Handicap.
   */
  rounding: HandicapRounding;
  /** Identifies the confirmed rule set stored with the snapshot. */
  rulesVersion: string;
}

export interface HandicapSnapshot {
  index: number;
  indexSource: string;
  indexEffectiveDate: string;
  teeId: string;
  courseRating: number;
  slope: number;
  coursePar: number;
  allowance: number;
  rounding: HandicapRounding;
  courseHandicap: number;
  playingHandicap: number;
  rulesVersion: string;
}

export type HandicapProblemCode =
  | "missing_index"
  | "invalid_index"
  | "missing_source"
  | "invalid_source"
  | "missing_effective_date"
  | "invalid_effective_date"
  | "missing_tee"
  | "invalid_tee"
  | "missing_allowance"
  | "invalid_allowance"
  | "missing_rules_version";

export interface HandicapProblem {
  code: HandicapProblemCode;
  message: string;
}

export type HandicapCalculation =
  | { ok: true; snapshot: HandicapSnapshot }
  | { ok: false; problems: HandicapProblem[] };

export interface HoleScore {
  hole: number;
  grossStrokes: number;
}

export interface ScoredHole {
  hole: number;
  par: number;
  strokeIndex: number;
  grossStrokes: number;
  /** Strokes received on this hole. Negative for a plus handicap. Null when no snapshot. */
  handicapStrokes: number | null;
  netStrokes: number | null;
  grossPoints: number;
  netPoints: number | null;
}

export type ScoringProblemCode =
  | "duplicate_hole"
  | "unknown_hole"
  | "invalid_strokes"
  | "invalid_stroke_limits"
  | "missing_hole"
  | "invalid_course"
  | "handicap_mismatch";

export interface ScoringProblem {
  code: ScoringProblemCode;
  hole: number | null;
  message: string;
}

export interface RoundScoring {
  holes: ScoredHole[];
  totalHoles: number;
  holesCompleted: number;
  grossStrokes: number;
  grossPoints: number;
  netStrokes: number | null;
  netPoints: number | null;
  netStatus: "calculated" | "unavailable";
}

export type RoundScoringResult =
  | { ok: true; result: RoundScoring; warnings: ScoringProblem[] }
  | { ok: false; problems: ScoringProblem[] };

export type CardSource = "manual" | "upload" | "webcam";
export type CardStatus =
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "superseded"
  | "revoked";

export interface CardEntry {
  hole: number;
  /** Null when the entry is missing or illegible. */
  strokes: number | null;
  /** OCR confidence 0..1. Null for a manual entry. */
  confidence: number | null;
  /** A person has checked this value against the paper card. */
  manuallyConfirmed: boolean;
}

export interface Scorecard {
  id: string;
  roundId: string;
  playerId: string;
  /** The participant assigned to mark this card. Never the player themself. */
  scorerId: string;
  source: CardSource;
  revision: number;
  status: CardStatus;
  entries: readonly CardEntry[];
  /** The total written on the paper card, when there is one. */
  writtenTotal: number | null;
  submittedAt: string;
}

export type CardIssueCode =
  | "self_scored"
  | "wrong_round"
  | "duplicate_hole"
  | "unknown_hole"
  | "missing_hole"
  | "invalid_strokes"
  | "invalid_stroke_limits"
  | "invalid_confidence"
  | "invalid_revision"
  | "written_total_mismatch"
  | "written_total_missing"
  | "low_confidence";

export type CardIssueSeverity = "blocking" | "review" | "warning";

export interface CardIssue {
  code: CardIssueCode;
  severity: CardIssueSeverity;
  hole: number | null;
  message: string;
}

export interface CardValidation {
  /** False while any blocking or review issue remains. Warnings alone do not block. */
  approvable: boolean;
  issues: CardIssue[];
}

export type HoleVerificationStatus = "verified" | "provisional" | "conflict" | "pending";
export type HoleProvenance = "agreement" | "single_card" | "desk_resolution";

export interface CanonicalHole {
  hole: number;
  status: HoleVerificationStatus;
  strokes: number | null;
  provenance: HoleProvenance | null;
  evidenceCardIds: string[];
  note: string | null;
}

export interface Resolution {
  id: string;
  roundId: string;
  playerId: string;
  hole: number;
  strokes: number;
  resolvedBy: string;
  resolvedAt: string;
  /** Required. The operations desk records why it chose this value. */
  reason: string;
  /** Every card the desk considered, kept for the audit trail. */
  evidenceCardIds: readonly string[];
  /** The canonical value before this resolution, when there was one. */
  previousStrokes: number | null;
}

export type CanonicalProblemCode =
  | "invalid_course"
  | "invalid_policy"
  | "invalid_stroke_limits"
  | "wrong_round_card"
  | "wrong_player_card"
  | "self_scored_card"
  | "duplicate_card_revision"
  | "no_approved_cards"
  | "invalid_card_entry"
  | "low_confidence_entry"
  | "invalid_resolution";

export interface CanonicalProblem {
  code: CanonicalProblemCode;
  hole: number | null;
  message: string;
}

export interface CanonicalRound {
  roundId: string;
  playerId: string;
  holes: CanonicalHole[];
  counts: {
    verified: number;
    provisional: number;
    conflict: number;
    pending: number;
  };
  /** True only when every hole is verified, never when a hole is provisional. */
  complete: boolean;
  problems: CanonicalProblem[];
}

export interface VerificationPolicy {
  /**
   * Independent approved cards required per hole. Null means the organizer has not confirmed
   * the required count, so no hole can be verified and finalization stays blocked.
   */
  requiredCards: number | null;
  /** A single approved card may appear on the provisional board. */
  allowProvisionalSingleCard: boolean;
  /** Below this confidence an OCR value needs manual confirmation before it counts as evidence. */
  minOcrConfidence: number;
}

export interface PolicyProblem {
  field: "requiredCards" | "allowProvisionalSingleCard" | "minOcrConfidence";
  message: string;
}

export interface StandingsPlayer {
  registrationId: string;
  playerId: string;
  playerName: string;
  flightId: string | null;
  canonical: CanonicalRound;
  handicap: HandicapSnapshot | null;
}

export interface PlayerRoundTotals {
  registrationId: string;
  playerId: string;
  playerName: string;
  flightId: string | null;
  holesCounted: number;
  totalHoles: number;
  grossStrokes: number;
  grossPoints: number;
  netStrokes: number | null;
  netPoints: number | null;
  netStatus: "calculated" | "unavailable";
  complete: boolean;
  provisional: boolean;
}

export interface StandingsRow extends PlayerRoundTotals {
  position: number;
  tied: boolean;
}

export interface StandingsBoard {
  kind: "gross" | "net";
  rows: StandingsRow[];
}

export type StandingsExclusionReason = "no_eligible_holes" | "wrong_round" | "scoring_failed";

export interface StandingsExclusion {
  registrationId: string;
  playerId: string;
  playerName: string;
  reason: StandingsExclusionReason;
  detail: string;
}

export interface NetExclusion {
  playerId: string;
  playerName: string;
  reason: "handicap_unavailable";
}

export interface StandingsResult {
  roundId: string;
  /** Provisional by construction; official results only exist after finalization. */
  official: false;
  players: PlayerRoundTotals[];
  gross: StandingsBoard;
  net: StandingsBoard;
  excluded: StandingsExclusion[];
  netExcluded: NetExclusion[];
}

export interface TieBreakPolicy {
  id: string;
  name: string;
  /** The organizer's written rule, or a reference to where it is kept. */
  source: string;
  confirmedBy: string;
  confirmedAt: string;
}

export type FinalizationBlockerCode =
  | "no_players"
  | "round_mismatch"
  | "course_invalid"
  | "policy_invalid"
  | "required_cards_unconfirmed"
  | "round_incomplete"
  | "conflicts_unresolved"
  | "net_unavailable"
  | "tie_break_unconfirmed"
  | "not_authorized";

export interface FinalizationBlocker {
  code: FinalizationBlockerCode;
  playerId: string | null;
  hole: number | null;
  message: string;
}

export interface FinalizationReadiness {
  ready: boolean;
  blockers: FinalizationBlocker[];
}

export interface StandingsInput {
  roundId: string;
  course: RoundCourse;
  policy: VerificationPolicy;
  players: readonly StandingsPlayer[];
}

export interface FinalizationInput extends StandingsInput {
  tieBreak: TieBreakPolicy | null;
  /** The staff member asking to finalize. Role authorization is checked by the caller. */
  approvedBy: string | null;
}
