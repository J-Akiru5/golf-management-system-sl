import {
  type CardBoxReading,
  cardBoxNote,
  type EventHandicapResult,
  type EventScoringRules,
  eventHandicapSnapshot,
  eventPlayingHandicap,
  eventRulesFor,
  readCardBox,
} from "./event-rules";
import type { HandicapSnapshot, Scorecard, TeeRatings } from "./types";

/**
 * The card letters a scorecard uses for a tee, and the desk's name for each. The owner's rule
 * (14 Nov 2026) makes the letter written on the card the tee the card is scored on.
 */
const CARD_TEE_NAMES: Readonly<Record<string, string>> = {
  B: "Blue",
  W: "White",
  L: "Ladies",
  S: "Silver",
};

/**
 * The card letter a tee name, a tee id or the tee written on a card stands for: B, W, L or S.
 * Empty when it is none of them, so an unknown tee is refused rather than guessed.
 *
 * The desk names its Ladies tee "Red" or "Ladies Red"; both are L on the card. A single letter is
 * read as itself, which is what the tabulation sheet exports.
 */
export function teeLetter(value: string | null | undefined): string {
  const raw = (value ?? "").trim().toUpperCase();
  if (raw === "") return "";
  if (CARD_TEE_NAMES[raw] !== undefined) return raw;
  if (raw.startsWith("WHITE")) return "W";
  if (raw.startsWith("BLUE")) return "B";
  if (raw.startsWith("RED")) return "L";
  if (raw.startsWith("SILVER")) return "S";
  if (raw.startsWith("LADIES")) {
    // "Ladies Red" is the Ladies tee; a Ladies White or Ladies Blue tee is still W or B on a card.
    if (raw.includes("WHITE")) return "W";
    if (raw.includes("BLUE")) return "B";
    if (raw.includes("SILVER")) return "S";
    return "L";
  }
  return "";
}

/** The desk's name for a card letter, for a refusal that says what to fix. */
export function teeLetterName(letter: string): string {
  const code = letter.trim().toUpperCase();
  return CARD_TEE_NAMES[code] ?? code;
}

export interface CardTeeInput {
  /** The tee written on the card, as a letter or a name. Blank or missing when the card has none. */
  cardTee?: string | null;
  /**
   * The ratings of the tee on the player's registration. Undefined means the caller did not load
   * them and the round's tee is used. Null means the registration has no tee.
   */
  registration?: TeeRatings | null;
  /** The round's tee, used only when the caller did not load the registration tee. */
  round: TeeRatings;
  /** The course's own tee ratings, used to resolve a card tee that is not the registration tee. */
  tees?: readonly TeeRatings[];
}

export type CardTeeSource = "card" | "registration" | "round";

export type CardTeeResult =
  | {
      ok: true;
      /** The tee the playing handicap is worked out on. */
      tee: TeeRatings;
      /** "card" when the letter on the card decided it; otherwise the registration or round tee. */
      source: CardTeeSource;
      /** The card letter the tee carries, or "" when its name is not one a card can write. */
      letter: string;
    }
  | { ok: false; message: string };

function namesLetter(tee: TeeRatings, letter: string): boolean {
  return teeLetter(tee.name) === letter || teeLetter(tee.id) === letter;
}

/**
 * The tee a card is scored on: the letter written on the card when there is one, otherwise the
 * registration tee (the round's tee when the caller did not load the registration's).
 *
 * A card letter the round has no rating for is a refusal, never a fallback to another tee. Falling
 * back would score the card on a tee that is not the one written on it, which is finding T7.
 */
export function resolveCardTee(input: CardTeeInput): CardTeeResult {
  const written = (input.cardTee ?? "").trim();
  if (written !== "") {
    const letter = teeLetter(written);
    if (!letter) {
      return {
        ok: false,
        message: `the tee written on the card ("${written}") is not one of B, W, L or S. Check the card and the player's tee, then save it again.`,
      };
    }
    const fromCourse = (input.tees ?? []).find((tee) => namesLetter(tee, letter));
    if (fromCourse) return { ok: true, tee: fromCourse, source: "card", letter };
    const registration = input.registration ?? null;
    if (registration && namesLetter(registration, letter)) {
      return { ok: true, tee: registration, source: "card", letter };
    }
    if (namesLetter(input.round, letter)) {
      return { ok: true, tee: input.round, source: "card", letter };
    }
    const name = teeLetterName(letter);
    return {
      ok: false,
      message: `the card says ${name} (${letter}), but this round has no ${name} tee rating. Add the rating or correct the card; the card cannot be scored on another tee.`,
    };
  }

  if (input.registration === undefined) {
    return { ok: true, tee: input.round, source: "round", letter: teeLetter(input.round.name) };
  }
  if (input.registration === null) {
    return {
      ok: false,
      message:
        "no tee is recorded on the registration. Set the player's tee in the field list, then save the card.",
    };
  }
  return {
    ok: true,
    tee: input.registration,
    source: "registration",
    letter: teeLetter(input.registration.name),
  };
}

/**
 * Decides, before anything is written, whether a card can be saved under an event's rules, and says
 * exactly what the save will do. Both the demo repository and the connected one call this so they
 * refuse the same cards for the same reasons.
 *
 * The playing handicap comes from the player's registration index and the tee written on the card,
 * never from the number in the card's HDCP box. The registration tee is used only when the card has
 * none (owner's rule, 14 Nov 2026). The box is read only to put a note beside the WHS figure when
 * the two differ.
 *
 * Pure: no database, clock or network. The caller says what day it is.
 */

export interface EventCardPlayer {
  playerId: string;
  playerName: string;
  handicap: HandicapSnapshot | null;
  /**
   * The registration's frozen index. Null means no index is on file. Left out, the caller did not
   * load it, which is read as no index on file and flagged for the desk to check.
   */
  frozenIndex?: number | null;
  /**
   * The ratings of the tee on the registration. Null means the registration has no tee, which
   * blocks the save. Left out, the caller did not load it and the round's tee is used.
   */
  tee?: TeeRatings | null;
}

export interface EventCardPlanInput {
  rulesVersion: string | null;
  roundStatus: "draft" | "open" | "scoring" | "provisional" | "final";
  requiredCards: number | null;
  /** The round's tee, used when the caller did not load the player's own tee. */
  tee: TeeRatings;
  /** ISO date the handicap is valid from. Used for the in-memory snapshot. */
  effectiveDate: string;
  playerId: string;
  /** The tee written on the card, when the caller knows it. Blank or missing: the registration tee. */
  cardTee?: string | null;
  /** The course's tee ratings, used to resolve a card tee that is not the registration tee. */
  tees?: readonly TeeRatings[];
  /** Who marked the card, when the desk knows. Left out, a stable placeholder is chosen. */
  scorerId?: string | null;
  /** The HDCP box as typed. A note only: it never decides the playing handicap. */
  cardHandicap: string | null | undefined;
  players: readonly EventCardPlayer[];
  cards: readonly Pick<Scorecard, "playerId" | "scorerId" | "status" | "revision">[];
}

export interface EventCardMarker {
  playerId: string;
  playerName: string;
  /** True when the desk did not name a marker, so one was filled in to satisfy the database. */
  placeholder: boolean;
}

export type EventCardPlan =
  | { ok: false; message: string }
  | {
      ok: true;
      rules: EventScoringRules;
      /** The WHS working: the index used, whether it was capped, and the handicaps it gives. */
      handicap: Extract<EventHandicapResult, { ok: true }>;
      /** The tee the card was worked out on: the card's letter when it has one. */
      tee: TeeRatings;
      /** "card" when the letter on the card decided the tee. */
      teeSource: CardTeeSource;
      /** The HDCP box as typed, kept for the note and the audit sentence. */
      cardBox: CardBoxReading;
      /** "card says 22, plays off 19 (index 16.4, White)" when the box disagrees, else null. */
      cardNote: string | null;
      marker: EventCardMarker;
      /** The snapshot the engine will score net points from. */
      snapshot: HandicapSnapshot;
      /** False when the round already holds a snapshot with this playing handicap. */
      needsSnapshotWrite: boolean;
      /** The sentence written to the scoring audit with the approval. */
      auditReason: string;
    };

const ACTIVE = new Set<Scorecard["status"]>(["submitted", "in_review", "approved"]);

export interface EventHandicapPlanInput {
  rulesVersion: string | null;
  roundStatus: "draft" | "open" | "scoring" | "provisional" | "final";
  /** The round's tee, used when the caller did not load the player's own tee. */
  tee: TeeRatings;
  /** The tee written on the card, when the caller knows it. Blank or missing: the registration tee. */
  cardTee?: string | null;
  /** The course's tee ratings, used to resolve a card tee that is not the registration tee. */
  tees?: readonly TeeRatings[];
  /** ISO date the handicap is valid from. Used for the in-memory snapshot. */
  effectiveDate: string;
  player: EventCardPlayer;
}

export type EventHandicapPlan =
  | { ok: false; message: string }
  | {
      ok: true;
      rules: EventScoringRules;
      /** The WHS working: the index used, whether it was capped, and the handicaps it gives. */
      handicap: Extract<EventHandicapResult, { ok: true }>;
      /** The tee the card was worked out on: the card's letter when it has one. */
      tee: TeeRatings;
      /** "card" when the letter on the card decided the tee. */
      teeSource: CardTeeSource;
      /** The snapshot the engine will score net points from. */
      snapshot: HandicapSnapshot;
      /** False when the round already holds a snapshot with this playing handicap. */
      needsSnapshotWrite: boolean;
    };

/**
 * The handicap one player's card is scored with, worked out from the registration index and the tee
 * written on the card, with the registration tee as the fallback when the card has none.
 *
 * Both a card save and a card approval go through this, so a card that reached the desk by import,
 * by the tabulator or by hand is scored on the same number. A snapshot that already plays off the
 * WHS figure is left alone; one that differs can only be changed while the round is still draft or
 * open, because the database freezes it after that. Nothing is guessed and nothing is silently kept.
 */
export function planEventHandicap(input: EventHandicapPlanInput): EventHandicapPlan {
  const player = input.player;
  const rules = eventRulesFor(input.rulesVersion);
  if (!rules) {
    return {
      ok: false,
      message: `This round is not on the event's card rules (its rules version is ${
        input.rulesVersion ? `"${input.rulesVersion}"` : "not set"
      }). Open the round with the rules version the event uses, or enter the card the ordinary way.`,
    };
  }
  if (
    input.roundStatus !== "open" &&
    input.roundStatus !== "scoring" &&
    input.roundStatus !== "provisional"
  ) {
    return {
      ok: false,
      message:
        input.roundStatus === "draft"
          ? "The round is not open yet. Open it from the published draw before saving or approving cards."
          : "The round is final, so it no longer accepts cards.",
    };
  }

  // The card's own letter decides the tee; the registration is the fallback when it has none. A
  // letter with no rating is refused here rather than scored on another tee.
  const resolvedTee = resolveCardTee({
    cardTee: input.cardTee,
    registration: player.tee,
    round: input.tee,
    tees: input.tees,
  });
  if (!resolvedTee.ok)
    return { ok: false, message: `${player.playerName}: ${resolvedTee.message}` };
  const tee = resolvedTee.tee;

  const handicap = eventPlayingHandicap({
    index: player.frozenIndex ?? null,
    tee,
    rule: rules.handicap,
  });
  if (!handicap.ok) return { ok: false, message: `${player.playerName}: ${handicap.message}` };

  const needsSnapshotWrite = player.handicap?.playingHandicap !== handicap.playingHandicap;
  if (needsSnapshotWrite && player.handicap !== null && input.roundStatus !== "open") {
    return {
      ok: false,
      message: `${player.playerName} already has a handicap snapshot of ${player.handicap.playingHandicap}, and it is frozen once scoring starts, so it cannot change to the WHS figure of ${handicap.playingHandicap}. An owner or organizer can use Correct handicap on the Scores screen and then save the card.`,
    };
  }

  return {
    ok: true,
    rules,
    handicap,
    tee,
    teeSource: resolvedTee.source,
    snapshot: eventHandicapSnapshot({
      handicap,
      rules,
      tee,
      effectiveDate: input.effectiveDate,
    }),
    needsSnapshotWrite,
  };
}

/**
 * The marker stored with a card the desk checked itself. The database needs a different player who
 * is active in the round, but this event does not publish markers.
 *
 * The same player always gets the same marker: an existing card's marker is reused, otherwise the
 * round's other players are ordered by id and the first is taken. That keeps a repeated import from
 * adding a second card under a different marker.
 */
export function pickDeskMarker(
  players: readonly Pick<EventCardPlayer, "playerId" | "playerName">[],
  playerId: string,
  cards: readonly Pick<Scorecard, "playerId" | "scorerId" | "status" | "revision">[],
): EventCardMarker | null {
  const existing = cards
    .filter((card) => card.playerId === playerId && ACTIVE.has(card.status))
    .sort((left, right) => right.revision - left.revision)[0];
  if (existing) {
    const known = players.find((player) => player.playerId === existing.scorerId);
    return {
      playerId: existing.scorerId,
      playerName: known?.playerName ?? existing.scorerId,
      // Kept as the first card had it, so it is whatever that card recorded, not a new stand-in.
      placeholder: false,
    };
  }
  const others = players
    .filter((player) => player.playerId !== playerId)
    .sort((left, right) => (left.playerId < right.playerId ? -1 : 1));
  const first = others[0];
  return first
    ? { playerId: first.playerId, playerName: first.playerName, placeholder: true }
    : null;
}

export function planEventCardSave(input: EventCardPlanInput): EventCardPlan {
  const rules = eventRulesFor(input.rulesVersion);
  if (!rules) {
    return {
      ok: false,
      message: `This round is not on the event's card rules (its rules version is ${
        input.rulesVersion ? `"${input.rulesVersion}"` : "not set"
      }). Open the round with the rules version the event uses, or enter the card the ordinary way.`,
    };
  }
  if (
    input.roundStatus !== "open" &&
    input.roundStatus !== "scoring" &&
    input.roundStatus !== "provisional"
  ) {
    return {
      ok: false,
      message:
        input.roundStatus === "draft"
          ? "The round is not open yet. Open it from the published draw before saving cards."
          : "The round is final, so it no longer accepts cards.",
    };
  }
  if (input.requiredCards !== rules.requiredCards) {
    return {
      ok: false,
      message: `This round needs ${
        input.requiredCards === null ? "an unset number of" : input.requiredCards
      } cards per player, but the event rule is ${rules.requiredCards}. The count is fixed once scoring starts, so an owner has to settle it before desk-checked cards can be saved.`,
    };
  }

  const player = input.players.find((candidate) => candidate.playerId === input.playerId);
  if (!player) {
    return { ok: false, message: "That player is not in this round." };
  }

  let marker: EventCardMarker | null;
  if (input.scorerId) {
    const named = input.players.find((candidate) => candidate.playerId === input.scorerId);
    if (!named) return { ok: false, message: "The marker is not a player in this round." };
    if (named.playerId === input.playerId) {
      return { ok: false, message: "A player cannot mark their own card." };
    }
    marker = { playerId: named.playerId, playerName: named.playerName, placeholder: false };
  } else {
    marker = pickDeskMarker(input.players, input.playerId, input.cards);
  }
  if (!marker) {
    return { ok: false, message: "A card needs a second player in the round to stand as marker." };
  }

  // The playing handicap is the WHS figure for the registration index on the tee written on the
  // card, with the registration tee as the fallback when the card has none.
  const planned = planEventHandicap({
    rulesVersion: input.rulesVersion,
    roundStatus: input.roundStatus,
    tee: input.tee,
    cardTee: input.cardTee,
    tees: input.tees,
    effectiveDate: input.effectiveDate,
    player,
  });
  if (!planned.ok) return { ok: false, message: planned.message };
  const { handicap, snapshot, needsSnapshotWrite, tee, teeSource } = planned;

  const cardBox = readCardBox(input.cardHandicap);
  const cardNote = cardBoxNote({
    box: cardBox,
    playingHandicap: handicap.playingHandicap,
    index: handicap.index,
    teeName: tee.name,
  });

  const written = cardBox.text === "" ? "blank" : cardBox.text;
  return {
    ok: true,
    rules,
    handicap,
    tee,
    teeSource,
    cardBox,
    cardNote,
    marker,
    snapshot,
    needsSnapshotWrite,
    auditReason: `Desk-checked card under ${rules.id}. WHS playing handicap ${handicap.playingHandicap} for index ${handicap.index} on ${tee.name}; HDCP on card ${written}.${
      handicap.warning ? ` ${handicap.warning}.` : ""
    }${marker.placeholder ? " Marker not recorded; the stored marker is a placeholder." : ""}`,
  };
}
