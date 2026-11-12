/**
 * Pure helpers for the single-card scoring workspace.
 *
 * The page owns the form and the repository owns persistence. Both helpers answer questions the
 * top bar and the totals panel ask on every keystroke, so they read the raw cell strings and never
 * turn a blank cell into zero, par or a guessed handicap.
 */
import { scoreRound } from "./stableford";
import type { CardIssue, HandicapSnapshot, HoleDefinition, HoleScore, RoundCourse } from "./types";
import { DEFAULT_STROKE_LIMITS, isNonEmptyString, isValidStrokes } from "./validation";

/** The scan or cell state the desk has recorded for one hole. */
export type ScorecardReviewState = "ok" | "check" | "blank";

export interface ScorecardReadinessInput {
  playerId: string;
  scorerId: string;
  holes: readonly HoleDefinition[];
  strokes: Readonly<Record<number, string>>;
  reviews?: Readonly<Record<number, ScorecardReviewState>>;
  correction?: boolean;
  correctionReason?: string;
  issues?: readonly CardIssue[];
}

export interface ScorecardReadiness {
  ready: boolean;
  /** The short reason for the top bar. "Ready to submit" only when nothing blocks. */
  label: string;
  /** Every reason the card cannot be submitted, in reading order. */
  blockers: string[];
}

export interface ScorecardSummaryInput {
  course: RoundCourse;
  strokes: Readonly<Record<number, string>>;
  handicap: HandicapSnapshot | null;
  /** The total written on the paper card, when there is one. */
  writtenTotal?: number | null;
}

export interface ScorecardSummary {
  gross: number;
  /** Holes 1 to 9, from the scores that are filled and valid. */
  out: number;
  /** Holes 10 to 18, from the scores that are filled and valid. */
  in: number;
  holesEntered: number;
  grossPoints: number;
  netPoints: number | null;
  netStatus: "calculated" | "unavailable";
  writtenTotal: number | null;
  /** Null while the card is incomplete or no written total was supplied. */
  writtenMatches: boolean | null;
  problems: string[];
}

/** A correction needs a reason long enough to say what changed and why. */
const MIN_CORRECTION_REASON_LENGTH = 3;

type HoleReading =
  | { readonly kind: "blank" }
  | { readonly kind: "invalid" }
  | { readonly kind: "valid"; readonly strokes: number };

function readHole(hole: number, strokes: Readonly<Record<number, string>>): HoleReading {
  const raw = (strokes[hole] ?? "").trim();
  if (raw === "") return { kind: "blank" };

  const value = Number(raw);
  if (!isValidStrokes(value, DEFAULT_STROKE_LIMITS)) return { kind: "invalid" };

  return { kind: "valid", strokes: value };
}

function invalidHoleMessage(hole: number): string {
  return `Hole ${hole} needs a whole-number score between ${DEFAULT_STROKE_LIMITS.min} and ${DEFAULT_STROKE_LIMITS.max}.`;
}

function holeCount(count: number): string {
  return `${count} hole${count === 1 ? "" : "s"}`;
}

function issueCount(count: number): string {
  return `${count} issue${count === 1 ? "" : "s"}`;
}

/**
 * Decides whether the card in the form may be submitted.
 *
 * Every rule is checked, not only the first one, so the blockers list is complete while the label
 * names the most useful next step. The label order follows the form: player, marker, scores,
 * scan checks, desk issues, correction reason.
 */
export function scorecardReadiness(input: ScorecardReadinessInput): ScorecardReadiness {
  const blockers: string[] = [];

  const playerChosen = isNonEmptyString(input.playerId);
  const markerChosen = isNonEmptyString(input.scorerId);
  const playerId = input.playerId.trim();
  const scorerId = input.scorerId.trim();

  if (!playerChosen) blockers.push("Choose a player.");
  if (!markerChosen) {
    blockers.push("Choose a marker.");
  } else if (playerChosen && playerId === scorerId) {
    blockers.push("Choose a different marker: a player cannot mark their own card.");
  }

  const roundHasNoHoles = input.holes.length === 0;
  if (roundHasNoHoles) blockers.push("The round has no holes.");

  let missingHoles = 0;
  for (const hole of input.holes) {
    const reading = readHole(hole.number, input.strokes);
    if (reading.kind === "valid") continue;

    missingHoles += 1;
    blockers.push(
      reading.kind === "blank"
        ? `Hole ${hole.number} has no score.`
        : invalidHoleMessage(hole.number),
    );
  }

  let uncheckedHoles = 0;
  for (const hole of input.holes) {
    const state = input.reviews?.[hole.number] ?? "ok";
    if (state === "ok") continue;

    uncheckedHoles += 1;
    blockers.push(
      state === "check"
        ? `Hole ${hole.number} needs a check against the paper card.`
        : `Hole ${hole.number} was blank on the scan and needs a check.`,
    );
  }

  const blockingIssues = (input.issues ?? []).filter((issue) => issue.severity === "blocking");
  for (const issue of blockingIssues) blockers.push(issue.message);

  const correctionReason = input.correctionReason?.trim() ?? "";
  const correctionReasonMissing =
    input.correction === true && correctionReason.length < MIN_CORRECTION_REASON_LENGTH;
  if (correctionReasonMissing) {
    blockers.push(
      `Add a reason for the correction (at least ${MIN_CORRECTION_REASON_LENGTH} characters).`,
    );
  }

  const ready = blockers.length === 0;
  let label = "Ready to submit";

  if (!playerChosen) {
    label = "Choose a player";
  } else if (!markerChosen || playerId === scorerId) {
    label = "Choose a different marker";
  } else if (missingHoles > 0) {
    label = `Needs ${holeCount(missingHoles)}`;
  } else if (uncheckedHoles > 0) {
    label = `Check ${holeCount(uncheckedHoles)}`;
  } else if (blockingIssues.length > 0 || roundHasNoHoles) {
    const count = blockingIssues.length + (roundHasNoHoles ? 1 : 0);
    label = `Resolve ${issueCount(count)}`;
  } else if (correctionReasonMissing) {
    label = "Add a correction reason";
  }

  return { ready, label, blockers };
}

function readWrittenTotal(value: number | null | undefined, problems: string[]): number | null {
  if (value === null || value === undefined) return null;
  if (Number.isInteger(value) && value > 0) return value;

  problems.push("The written total is not a positive whole number.");
  return null;
}

/**
 * Summarises the card as it currently stands.
 *
 * Only filled and valid holes are scored, so a half-entered card still shows honest partial
 * totals. A missing handicap leaves net unavailable rather than inventing strokes. When the engine
 * refuses the course, no totals are shown and its reasons are returned as problems.
 */
export function summariseScorecard(input: ScorecardSummaryInput): ScorecardSummary {
  const problems: string[] = [];
  const scores: HoleScore[] = [];

  for (const hole of input.course.holes) {
    const reading = readHole(hole.number, input.strokes);
    if (reading.kind === "blank") continue;
    if (reading.kind === "invalid") {
      problems.push(invalidHoleMessage(hole.number));
      continue;
    }

    scores.push({ hole: hole.number, grossStrokes: reading.strokes });
  }

  const writtenTotal = readWrittenTotal(input.writtenTotal, problems);

  const round = scoreRound({
    course: input.course,
    scores,
    handicap: input.handicap,
    requireComplete: false,
  });

  if (!round.ok) {
    return {
      gross: 0,
      out: 0,
      in: 0,
      holesEntered: 0,
      grossPoints: 0,
      netPoints: null,
      netStatus: "unavailable",
      writtenTotal,
      writtenMatches: null,
      problems: [...problems, ...round.problems.map((problem) => problem.message)],
    };
  }

  const { result, warnings } = round;
  let out = 0;
  let back = 0;
  for (const hole of result.holes) {
    if (hole.hole <= 9) out += hole.grossStrokes;
    else back += hole.grossStrokes;
  }

  const complete = result.totalHoles > 0 && result.holesCompleted === result.totalHoles;
  const writtenMatches =
    writtenTotal !== null && complete ? writtenTotal === result.grossStrokes : null;

  return {
    gross: result.grossStrokes,
    out,
    in: back,
    holesEntered: result.holesCompleted,
    grossPoints: result.grossPoints,
    netPoints: result.netPoints,
    netStatus: result.netStatus,
    writtenTotal,
    writtenMatches,
    problems: [...problems, ...warnings.map((warning) => warning.message)],
  };
}
