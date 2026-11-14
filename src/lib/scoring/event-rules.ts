import { courseHandicap } from "../routing/handicap";
import type { HandicapSnapshot, TeeRatings } from "./types";
import { HANDICAP_INDEX_LIMITS, teeProblems } from "./validation";

/**
 * Scoring rules for the 24th Bamboo Tee.
 *
 * These are settings of one event, not engine constants. The engine never reads this file: the
 * callers resolve the rule set from the round's `rules_version` and pass it in. A round whose
 * rules version is not listed here keeps the ordinary World Handicap path unchanged.
 *
 * What the owner confirmed (14 November 2026, "Single source of truth for the playing handicap"):
 * - The WHS playing handicap is the only handicap the event scores with. It is the registration
 *   index, capped at the event maximum, converted with the player's tee at the event allowance.
 * - It always wins over the number written in the card's HDCP box. That number is a note beside the
 *   WHS figure when the two differ, never the handicap the card is scored with.
 * - No index on file, or an index of 0, plays off the WHS figure for index 0, and the desk is
 *   flagged to check that index against WHS.
 * - One desk-checked card per player is enough.
 * - Strokes are given by stroke index (the engine already does this for every snapshot).
 * - Net points are par 2, birdie 3, bogey 1, worse 0 (the engine's Stableford table).
 * - An X is a pick-up: 0 points, no penalty, no stroke count.
 * - Markers are not published.
 */

/** How a card's playing handicap is arrived at. */
export interface WhsCardHandicapRule {
  /**
   * The playing handicap is the WHS figure for the registration index and the tee. The HDCP box on
   * the card does not decide it.
   */
  source: "whs";
  /** The event's maximum handicap index. A higher index plays off this cap. */
  maxIndex: number;
  /** The competition allowance as a fraction: 1 is 100%. */
  allowance: number;
}

export interface EventScoringRules {
  /** Stored on the round as `rules_version`, and on a handicap snapshot as its rules version. */
  id: string;
  name: string;
  /** Independent approved cards a hole needs before it counts as verified. */
  requiredCards: number;
  handicap: WhsCardHandicapRule;
}

/** The rule set of the 24th Bamboo Tee. Type this as the round's rules version when opening it. */
export const BAMBOO_TEE_2026_RULES: EventScoringRules = {
  id: "bamboo-tee-2026",
  name: "24th Bamboo Tee: one desk-checked card, WHS playing handicap from the index and tee",
  requiredCards: 1,
  handicap: { source: "whs", maxIndex: 30, allowance: 1 },
};

export const EVENT_SCORING_RULE_SETS: readonly EventScoringRules[] = [BAMBOO_TEE_2026_RULES];

/** The rule set a round names, or null when the round is on the ordinary rules. */
export function eventRulesFor(rulesVersion: string | null | undefined): EventScoringRules | null {
  const wanted = rulesVersion?.trim().toLowerCase();
  if (!wanted) return null;
  return EVENT_SCORING_RULE_SETS.find((rules) => rules.id === wanted) ?? null;
}

/**
 * Stored as the snapshot's index source by `save_card_handicap_snapshot`, the function a scorecard
 * save goes through. That function's `handicap_index` column holds the number it was handed, so the
 * snapshot it writes carries the WHS playing handicap in both handicap columns and the app reads it
 * back as a card save rather than recomputing it from the tee.
 */
export const CARD_HANDICAP_SOURCE = "Scorecard HDCP box";

/**
 * Stored as the snapshot's index source when the playing handicap is worked out from the
 * registration's frozen index and the tee. Written by `save_handicap_snapshot` and
 * `correct_handicap_snapshot`, and by the demo repository.
 */
export const REGISTRATION_INDEX_SOURCE = "Registration freeze";

/**
 * Stored as the snapshot's index source when an organizer corrects the index after the round has
 * left draft/open. Written by `correct_handicap_snapshot` in
 * 20261114000300_correct_handicap_snapshot.sql, and by the demo repository.
 */
export const CORRECTED_HANDICAP_SOURCE = "Manual correction";

/** Shown whenever a player has no index on file or an index of 0. */
export const ZERO_INDEX_WARNING = "index 0 on file, check WHS";

export type EventHandicapResult =
  | {
      ok: true;
      /** The index the figure was worked out from: on file, rounded to one decimal, capped. */
      index: number;
      /** The registration index as it was on file, or 0 when there is none. */
      onFile: number;
      /** True when the event maximum changed the index. */
      capped: boolean;
      /** True when there is no index on file, or the index is 0. */
      zeroIndex: boolean;
      /** {@link ZERO_INDEX_WARNING} for a zero index, otherwise null. */
      warning: string | null;
      courseHandicap: number;
      playingHandicap: number;
    }
  | {
      ok: false;
      code: "no_tee" | "invalid_tee" | "invalid_index" | "invalid_rule";
      message: string;
    };

export interface EventHandicapInput {
  /** The registration's frozen index. Null or missing means no index is on file. */
  index: number | null | undefined;
  /** The ratings of the tee on the player's registration. */
  tee: TeeRatings | null | undefined;
  rule: WhsCardHandicapRule;
}

/**
 * The WHS playing handicap a save is scored with.
 *
 * Index (capped at the event maximum) x slope / 113 + course rating - par, rounded half up, then
 * the event allowance applied and rounded again. At the 100% allowance the two steps agree with the
 * single figure the club's Course Handicap Tables carry. The rounding is the same as the database's
 * `save_handicap_snapshot`, so a snapshot written here and one written there hold the same number.
 *
 * Nothing is guessed: a missing tee or an index outside the WHS range is a refusal with the fix in
 * the message, and a missing index is index 0 with the flag the owner asked for.
 */
export function eventPlayingHandicap(input: EventHandicapInput): EventHandicapResult {
  const { rule } = input;
  if (!Number.isFinite(rule.maxIndex) || rule.maxIndex < HANDICAP_INDEX_LIMITS.min) {
    return {
      ok: false,
      code: "invalid_rule",
      message: `The event's maximum index (${rule.maxIndex}) is not a usable handicap limit. Fix the event rule before saving the card.`,
    };
  }
  if (!Number.isFinite(rule.allowance) || rule.allowance <= 0 || rule.allowance > 1) {
    return {
      ok: false,
      code: "invalid_rule",
      message: `The event allowance (${rule.allowance}) must be a fraction above 0 and at most 1. Fix the event rule before saving the card.`,
    };
  }

  const tee = input.tee;
  if (!tee) {
    return {
      ok: false,
      code: "no_tee",
      message:
        "no tee is recorded on the registration. Set the player's tee in the field list, then save the card.",
    };
  }
  const teeIssue = teeProblems(tee)[0];
  if (teeIssue) {
    return {
      ok: false,
      code: "invalid_tee",
      message: `the tee on the registration cannot be used: ${teeIssue} Fix the tee record, then save the card.`,
    };
  }

  const onFile = Math.round((input.index ?? 0) * 10) / 10;
  if (!Number.isFinite(onFile) || onFile < HANDICAP_INDEX_LIMITS.min) {
    return {
      ok: false,
      code: "invalid_index",
      message: `the index on file (${input.index}) is outside the WHS range. Correct it before saving the card.`,
    };
  }

  const index = Math.min(onFile, rule.maxIndex);
  const course = courseHandicap(index, tee);
  const allowed = Math.round(course * rule.allowance);
  // Math.round can produce -0; a handicap is never printed as "-0".
  const playingHandicap = allowed === 0 ? 0 : allowed;
  const zeroIndex = onFile === 0;

  return {
    ok: true,
    index,
    onFile,
    capped: index < onFile,
    zeroIndex,
    warning: zeroIndex ? ZERO_INDEX_WARNING : null,
    courseHandicap: course,
    playingHandicap,
  };
}

export interface CardBoxReading {
  /** The box as typed, trimmed. Empty when it is blank. */
  text: string;
  /** The number in the box, when it is a plain number. Null for a blank or unreadable box. */
  value: number | null;
}

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

/**
 * Reads the HDCP box as written, for the note only. A blank box, a plus handicap or anything else
 * that is not a plain number is kept as text and not compared with the WHS figure: the box no
 * longer decides the handicap, so an odd entry there must not stop a card being saved.
 */
export function readCardBox(raw: string | number | null | undefined): CardBoxReading {
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  if (text === "" || !PLAIN_NUMBER.test(text)) return { text, value: null };
  const value = Number(text);
  return { text, value: Number.isFinite(value) ? value : null };
}

/** One decimal, and no trailing ".0", so an index reads 16.4 or 30 rather than 16.40. */
function indexText(index: number): string {
  return Number.isInteger(index) ? String(index) : index.toFixed(1);
}

/**
 * The note beside the WHS number when the card's HDCP box disagrees with it, for example
 * "card says 22, plays off 19 (index 16.4, White)". A blank box has nothing to say. A box that is
 * not a plain number is still shown as written, since the desk should see what the card says beside
 * the number the card is scored with.
 */
export function cardBoxNote(input: {
  box: CardBoxReading;
  playingHandicap: number;
  index: number;
  teeName: string;
}): string | null {
  if (input.box.text === "") return null;
  if (input.box.value !== null && input.box.value === input.playingHandicap) return null;
  return `card says ${input.box.text}, plays off ${input.playingHandicap} (index ${indexText(
    input.index,
  )}, ${input.teeName})`;
}

export interface EventHandicapSnapshotInput {
  handicap: Extract<EventHandicapResult, { ok: true }>;
  rules: EventScoringRules;
  tee: TeeRatings;
  /** ISO date the handicap is valid from. The playing day. */
  effectiveDate: string;
}

/**
 * The snapshot the engine scores net points from under the event rule: the registration index, the
 * player's tee ratings, the event allowance, and the WHS playing handicap worked out from them.
 */
export function eventHandicapSnapshot(input: EventHandicapSnapshotInput): HandicapSnapshot {
  const { handicap, rules, tee, effectiveDate } = input;
  return {
    index: handicap.index,
    indexSource: REGISTRATION_INDEX_SOURCE,
    indexEffectiveDate: effectiveDate,
    teeId: tee.id,
    courseRating: tee.courseRating,
    slope: tee.slope,
    coursePar: tee.par,
    allowance: rules.handicap.allowance,
    rounding: "whs",
    courseHandicap: handicap.courseHandicap,
    playingHandicap: handicap.playingHandicap,
    rulesVersion: rules.id,
  };
}
