/**
 * Which played rounds an index correction has to reach, and the note each one is republished with.
 *
 * The WHS playing handicap for the player's tee is the single source of truth (owner's rule, 14
 * November 2026). So when the desk corrects an index, every round the player already has a card in
 * has to be corrected from that index and the player's registration tee, and a round that has been
 * published has to be published again or the public page keeps the old number.
 *
 * Pure functions only: the caller reads the rows and calls the database, this module decides what is
 * in scope.
 */
import { displayName, fmtIndex } from "@/lib/format";

/** The round states a snapshot may still be corrected in. A final round is refused by the database. */
export const CORRECTABLE_ROUND_STATUSES: readonly string[] = ["scoring", "provisional"];

export interface RoundForCorrection {
  id: string;
  /** draft, open, scoring, provisional or final. Only the correctable ones are used. */
  status: string;
}

export interface RoundEntryForCorrection {
  id: string;
  roundId: string;
  registrationId: string;
}

export interface RoundCorrection {
  roundId: string;
  roundEntryId: string;
  /** True when this round has been published at least once, so it is published again after correcting. */
  publish: boolean;
}

/**
 * The rounds one registration's index correction has to be carried into.
 *
 * A round counts when its status is scoring or provisional and it holds a round entry for this
 * registration. The result keeps the order the rounds were read in, which is day order, and carries
 * one entry per round: a round is corrected once, not once per matching row.
 */
export function roundsToCorrect(input: {
  rounds: readonly RoundForCorrection[];
  roundEntries: readonly RoundEntryForCorrection[];
  registrationId: string;
  publicationCounts: Readonly<Record<string, number>>;
}): RoundCorrection[] {
  const corrections: RoundCorrection[] = [];
  for (const round of input.rounds) {
    if (!CORRECTABLE_ROUND_STATUSES.includes(round.status)) continue;
    const entry = input.roundEntries.find(
      (candidate) =>
        candidate.roundId === round.id && candidate.registrationId === input.registrationId,
    );
    if (!entry) continue;
    corrections.push({
      roundId: round.id,
      roundEntryId: entry.id,
      publish: (input.publicationCounts[round.id] ?? 0) > 0,
    });
  }
  return corrections;
}

/**
 * The note a republished round carries, so the public version says what moved and why.
 * "BRAGA, NONOY: index corrected to 12.3; playing handicap recalculated from the White tee."
 */
export function indexCorrectionNote(input: {
  /** The player's stored name; written in capitals, as the club writes it. */
  playerName: string;
  /** The corrected index, after the dialog's checks and before the event maximum is applied. */
  index: number;
  /** The tee the playing handicap was recalculated on, which is the registration's tee. */
  teeName: string;
}): string {
  return `${displayName(input.playerName)}: index corrected to ${fmtIndex(input.index)}; playing handicap recalculated from the ${input.teeName} tee.`;
}

/**
 * Today in the club's time zone as the ISO date the database stores.
 *
 * A correction is dated the day the desk made it. The desk is in Iloilo, so the date is read in
 * Asia/Manila: an evening correction is not dated yesterday because the server clock is on UTC.
 */
export function todayInManila(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
