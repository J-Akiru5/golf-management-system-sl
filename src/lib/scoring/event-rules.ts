import type { HandicapSnapshot, TeeRatings } from "./types";
import { HANDICAP_INDEX_LIMITS } from "./validation";

/**
 * Scoring rules for an event that plays off the handicap written on the paper card.
 *
 * These are settings of one event, not engine constants. The engine never reads this file: the
 * callers resolve the rule set from the round's `rules_version` and pass it in. A round whose
 * rules version is not listed here keeps the ordinary World Handicap path unchanged.
 *
 * What the 24th Bamboo Tee owner confirmed (14 Nov 2026):
 * - One desk-checked card per player is enough.
 * - The playing handicap is the handicap written on the card with the decimal dropped. A blank box
 *   counts as 0.
 * - Strokes are given by stroke index (the engine already does this for every snapshot).
 * - Net points are par 2, birdie 3, bogey 1, worse 0 (the engine's Stableford table).
 * - An X is a pick-up: 0 points, no penalty, no stroke count.
 * - Markers are not published.
 */

/** Where the HDCP box value is read from and how it becomes a playing handicap. */
export interface CardHandicapRule {
  /** The playing handicap comes from the HDCP box on the card, not from the tee. */
  source: "card";
  /** The playing handicap when the box is blank. */
  blankPlayingHandicap: number;
}

export interface EventScoringRules {
  /** Stored on the round as `rules_version`, and on a card-handicap snapshot as its rules version. */
  id: string;
  name: string;
  /** Independent approved cards a hole needs before it counts as verified. */
  requiredCards: number;
  handicap: CardHandicapRule;
}

/** The rule set of the 24th Bamboo Tee. Type this as the round's rules version when opening it. */
export const BAMBOO_TEE_2026_RULES: EventScoringRules = {
  id: "bamboo-tee-2026",
  name: "24th Bamboo Tee: one desk-checked card, handicap as written on the card",
  requiredCards: 1,
  handicap: { source: "card", blankPlayingHandicap: 0 },
};

export const EVENT_SCORING_RULE_SETS: readonly EventScoringRules[] = [BAMBOO_TEE_2026_RULES];

/** The rule set a round names, or null when the round is on the ordinary rules. */
export function eventRulesFor(rulesVersion: string | null | undefined): EventScoringRules | null {
  const wanted = rulesVersion?.trim().toLowerCase();
  if (!wanted) return null;
  return EVENT_SCORING_RULE_SETS.find((rules) => rules.id === wanted) ?? null;
}

/** Stored as the snapshot's index source. The connected view reads it to tell a card snapshot apart. */
export const CARD_HANDICAP_SOURCE = "Scorecard HDCP box";

/**
 * Stored as the snapshot's index source when an organizer corrects the index after the round has
 * left draft/open. Written by `correct_handicap_snapshot` in
 * 20261114000300_correct_handicap_snapshot.sql, and by the demo repository.
 */
export const CORRECTED_HANDICAP_SOURCE = "Manual correction";

export type CardHandicapReading =
  | {
      ok: true;
      /** The number in the box, or null when the box is blank. */
      cardValue: number | null;
      blank: boolean;
      playingHandicap: number;
    }
  | { ok: false; message: string };

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

/**
 * Reads the HDCP box exactly as written.
 *
 * Blank counts as the rule's blank value. A plain number has its decimal dropped, so 16.7 plays
 * off 16. Anything else (a plus handicap, text, a negative number, a number above the handicap
 * limit) is refused, because the rule does not say what to do with it and a guess would score a
 * player wrongly.
 */
export function readCardHandicap(
  raw: string | number | null | undefined,
  rule: CardHandicapRule,
): CardHandicapReading {
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  if (text === "") {
    return { ok: true, cardValue: null, blank: true, playingHandicap: rule.blankPlayingHandicap };
  }
  if (!PLAIN_NUMBER.test(text)) {
    return {
      ok: false,
      message: `The handicap "${text}" is not a plain number. Type it as written on the card, for example 16.7, or leave it blank.`,
    };
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value > HANDICAP_INDEX_LIMITS.max) {
    return {
      ok: false,
      message: `The handicap "${text}" is above the limit of ${HANDICAP_INDEX_LIMITS.max}. Check the card.`,
    };
  }
  return { ok: true, cardValue: value, blank: false, playingHandicap: Math.floor(value) };
}

export interface CardHandicapSnapshotInput {
  reading: Extract<CardHandicapReading, { ok: true }>;
  rules: EventScoringRules;
  tee: TeeRatings;
  /** ISO date the handicap is valid from. The playing day. */
  effectiveDate: string;
}

/** The box value cut (not rounded) to one decimal, so 16.97 stays 16.9 and still plays off 16. */
function indexToOneDecimal(value: number): number {
  return Math.floor(value * 10 + 1e-9) / 10;
}

/**
 * The snapshot the engine scores net points from under the card rule. The index is the box value
 * cut to one decimal (0 when blank); both handicaps are the whole number the rule produces.
 */
export function cardHandicapSnapshot(input: CardHandicapSnapshotInput): HandicapSnapshot {
  const { reading, rules, tee, effectiveDate } = input;
  return {
    index: reading.cardValue === null ? 0 : indexToOneDecimal(reading.cardValue),
    indexSource: CARD_HANDICAP_SOURCE,
    indexEffectiveDate: effectiveDate,
    teeId: tee.id,
    courseRating: tee.courseRating,
    slope: tee.slope,
    coursePar: tee.par,
    allowance: 1,
    rounding: "card",
    courseHandicap: reading.playingHandicap,
    playingHandicap: reading.playingHandicap,
    rulesVersion: rules.id,
  };
}
