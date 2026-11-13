import {
  type CardHandicapReading,
  cardHandicapSnapshot,
  type EventScoringRules,
  eventRulesFor,
  readCardHandicap,
} from "./event-rules";
import type { HandicapSnapshot, Scorecard, TeeRatings } from "./types";

/**
 * Decides, before anything is written, whether a card can be saved under an event's card rules,
 * and says exactly what the save will do. Both the demo repository and the connected one call this
 * so they refuse the same cards for the same reasons.
 *
 * Pure: no database, clock or network. The caller says what day it is.
 */

export interface EventCardPlayer {
  playerId: string;
  playerName: string;
  handicap: HandicapSnapshot | null;
}

export interface EventCardPlanInput {
  rulesVersion: string | null;
  roundStatus: "draft" | "open" | "scoring" | "provisional" | "final";
  requiredCards: number | null;
  tee: TeeRatings;
  /** ISO date the card handicap is valid from. Used for the in-memory snapshot. */
  effectiveDate: string;
  playerId: string;
  /** Who marked the card, when the desk knows. Left out, a stable placeholder is chosen. */
  scorerId?: string | null;
  /** The HDCP box as typed. Blank counts as the rule's blank value. */
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
      reading: Extract<CardHandicapReading, { ok: true }>;
      marker: EventCardMarker;
      /** The snapshot the engine will score net points from. */
      snapshot: HandicapSnapshot;
      /** False when the round already holds a snapshot with this playing handicap. */
      needsSnapshotWrite: boolean;
      /** The sentence written to the scoring audit with the approval. */
      auditReason: string;
    };

const ACTIVE = new Set<Scorecard["status"]>(["submitted", "in_review", "approved"]);

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

  const reading = readCardHandicap(input.cardHandicap, rules.handicap);
  if (!reading.ok) {
    return { ok: false, message: `${player.playerName}: ${reading.message}` };
  }

  const needsSnapshotWrite = player.handicap?.playingHandicap !== reading.playingHandicap;
  if (needsSnapshotWrite && player.handicap !== null && input.roundStatus !== "open") {
    return {
      ok: false,
      message: `${player.playerName} already has a handicap snapshot of ${player.handicap.playingHandicap}, and it is frozen once scoring starts, so it cannot change to the card's ${reading.playingHandicap}. An owner has to decide how to correct it.`,
    };
  }

  const snapshot = cardHandicapSnapshot({
    reading,
    rules,
    tee: input.tee,
    effectiveDate: input.effectiveDate,
  });
  const written = reading.blank ? "blank" : String(input.cardHandicap).trim();
  return {
    ok: true,
    rules,
    reading,
    marker,
    snapshot,
    needsSnapshotWrite,
    auditReason: `Desk-checked card under ${rules.id}. HDCP on card ${written}, plays off ${reading.playingHandicap}.${
      marker.placeholder ? " Marker not recorded; the stored marker is a placeholder." : ""
    }`,
  };
}
