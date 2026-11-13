/**
 * Proposing players for a name read from a scorecard photo.
 *
 * A photo reader misread "GORMLEY" as "Wormley" and "LIM" as "Um" on Day 1, and a person had to
 * find the player by hand. This module only proposes candidates with the reasons it found them. It
 * never picks one, and it never changes a name. The desk decides.
 *
 * The surname carries most of the score. Given name, tee, playing handicap and group are support:
 * a tee that disagrees lowers the score but never removes a candidate, and a value that is missing
 * on either side changes nothing because it is never invented.
 *
 * Pure functions only: no I/O, no React, no Supabase.
 */

import { parseName, searchKey } from "@/lib/names";

export interface CardReading {
  /** The name as read from the card, any order, any case. Required. */
  name: string;
  /** Tee letter read from the card, if any. */
  tee?: "B" | "W" | "L" | null;
  /** The number in the card's HDCP box, if read. For comparison only. */
  cardHandicap?: number | null;
  /** The group or start slot label read from the card, if any. */
  group?: string | null;
}

export interface RoundPlayer {
  playerId: string;
  /** Stored form "SURNAME, GIVEN". */
  name: string;
  tee?: "B" | "W" | "L" | null;
  playingHandicap?: number | null;
  group?: string | null;
  /** True when this player already has a card in this round. */
  hasCard?: boolean;
}

export type MatchReasonCode =
  | "exact-name"
  | "surname-exact"
  | "surname-close"
  | "given-name-match"
  | "given-initial-match"
  | "tee-match"
  | "handicap-close"
  | "same-group";

export interface MatchReason {
  code: MatchReasonCode;
  /** Plain words for the desk, e.g. "surname one letter off". */
  text: string;
}

export interface MatchCandidate {
  playerId: string;
  /** 0 to 1, higher is better. Used only to order candidates. */
  score: number;
  reasons: MatchReason[];
  /** Copied from the player so the desk can mark a duplicate card. */
  hasCard: boolean;
}

export interface MatchOptions {
  /** Most candidates to return. Default 4. */
  limit?: number;
  /** Candidates scoring below this are dropped. Default 0.35. */
  minScore?: number;
}

const DEFAULT_LIMIT = 4;
const DEFAULT_MIN_SCORE = 0.35;

/** Surname is the main signal, so it carries most of the weight. */
const SURNAME_WEIGHT = 0.72;
const GIVEN_WEIGHT = 0.18;
const TEE_BONUS = 0.06;
const TEE_PENALTY = -0.04;
const HANDICAP_BONUS = 0.04;
const GROUP_BONUS = 0.04;

/** Guards the score floor against small floating point differences. */
const SCORE_EPSILON = 1e-9;

/** A surname this close counts as the same, leaving room for fractional confusion costs. */
const SAME_SURNAME = 0.9995;

/** How much a handwriting confusion costs against a normal edit. */
const CONFUSION_COST = 0.5;

/**
 * Letter groups a photo reader swaps more often than chance. Kept small on purpose: these are the
 * pairs seen on the club's cards, plus "li"/"u" from "LIM" being read as "Um".
 */
const CONFUSIONS: ReadonlyArray<readonly [string, string]> = [
  ["rn", "m"],
  ["u", "n"],
  ["c", "e"],
  ["l", "i"],
  ["a", "o"],
  ["u", "li"],
];

function substitutionCost(left: string, right: string): number {
  if (left === right) return 0;
  for (const [first, second] of CONFUSIONS) {
    if ((left === first && right === second) || (left === second && right === first)) {
      return CONFUSION_COST;
    }
  }
  return 1;
}

function confusionCost(left: string, right: string): number | null {
  for (const [first, second] of CONFUSIONS) {
    if ((left === first && right === second) || (left === second && right === first)) {
      return CONFUSION_COST;
    }
  }
  return null;
}

/**
 * Weighted Levenshtein distance with adjacent transpositions. Insertions and deletions cost 1, a
 * substitution costs 1 unless the pair is a known handwriting confusion (then 0.5), and a letter
 * pair written for one letter ("rn" for "m", "li" for "u") also costs 0.5.
 */
function editDistance(left: string, right: string): number {
  const width = right.length + 1;
  const table = new Float64Array((left.length + 1) * width);
  const read = (row: number, column: number): number => {
    const value = table[row * width + column];
    return typeof value === "number" ? value : Number.POSITIVE_INFINITY;
  };
  for (let row = 0; row <= left.length; row += 1) table[row * width] = row;
  for (let column = 0; column <= right.length; column += 1) table[column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const a = left[row - 1] ?? "";
      const b = right[column - 1] ?? "";
      let best = Math.min(
        read(row - 1, column) + 1,
        read(row, column - 1) + 1,
        read(row - 1, column - 1) + substitutionCost(a, b),
      );

      if (row >= 2) {
        const pair = `${left[row - 2] ?? ""}${a}`;
        const cost = confusionCost(pair, b);
        if (cost !== null) best = Math.min(best, read(row - 2, column - 1) + cost);
      }
      if (column >= 2) {
        const pair = `${right[column - 2] ?? ""}${b}`;
        const cost = confusionCost(a, pair);
        if (cost !== null) best = Math.min(best, read(row - 1, column - 2) + cost);
      }
      if (row >= 2 && column >= 2) {
        const beforeRow = left[row - 2] ?? "";
        const afterColumn = right[column] ?? "";
        if (beforeRow === b && a === afterColumn) {
          best = Math.min(best, read(row - 2, column - 2) + 1);
        }
      }

      table[row * width + column] = best;
    }
  }

  return read(left.length, right.length);
}

/**
 * How many mistakes separate two search keys, with handwriting confusions costing half an edit.
 */
function nameDistance(left: string, right: string): number {
  if (!left || !right) return Math.max(left.length, right.length);
  return editDistance(left, right);
}

/**
 * How alike two search keys are, from 0 to 1. Scaled by the longer key, so one wrong letter in a
 * long surname stays a strong match. Exported so the confusion table can be tested directly; the
 * public API is `matchPlayers`.
 */
export function nameSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 0;
  return Math.max(0, Math.min(1, 1 - editDistance(left, right) / longest));
}

interface NameParts {
  surname: string;
  given: string;
}

/**
 * The ways a card can be read. With a comma the order is certain. Without one the writer may have
 * put the given name or the surname first, so both readings are offered and the better surname wins.
 */
function cardReadings(name: string): NameParts[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  if (trimmed.includes(",")) {
    const parsed = parseName(trimmed);
    const surname = searchKey(parsed.surname);
    if (!surname) return [];
    return [{ surname, given: searchKey(parsed.given) }];
  }

  const words = searchKey(trimmed).split(" ").filter(Boolean);
  const first = words[0] ?? "";
  if (!first) return [];
  if (words.length === 1) return [{ surname: first, given: "" }];
  return [
    { surname: words.at(-1) ?? "", given: words.slice(0, -1).join(" ") },
    { surname: first, given: words.slice(1).join(" ") },
  ];
}

function playerParts(name: string): NameParts {
  const parsed = parseName(name);
  return {
    surname: searchKey(parsed.surname),
    given: searchKey(parsed.given),
  };
}

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = searchKey(left);
  return a !== "" && a === searchKey(right);
}

function sameTee(reading: CardReading, player: RoundPlayer): boolean {
  const cardTee = reading.tee ?? null;
  const playerTee = player.tee ?? null;
  return cardTee !== null && playerTee !== null && cardTee === playerTee;
}

function teeDisagrees(reading: CardReading, player: RoundPlayer): boolean {
  const cardTee = reading.tee ?? null;
  const playerTee = player.tee ?? null;
  return cardTee !== null && playerTee !== null && cardTee !== playerTee;
}

function handicapClose(reading: CardReading, player: RoundPlayer): boolean {
  const card = reading.cardHandicap ?? null;
  const playing = player.playingHandicap ?? null;
  if (card === null || playing === null) return false;
  if (!Number.isFinite(card) || !Number.isFinite(playing)) return false;
  return Math.abs(card - playing) <= 1;
}

interface Scored {
  playerId: string;
  name: string;
  score: number;
  reasons: MatchReason[];
  hasCard: boolean;
}

function scorePlayer(
  reading: CardReading,
  readings: readonly NameParts[],
  player: RoundPlayer,
): Scored | null {
  const parts = playerParts(player.name);
  if (!parts.surname) return null;

  let surnameSimilarity = -1;
  let surnameDistance = Number.POSITIVE_INFINITY;
  let given = "";
  for (const readingParts of readings) {
    const similarity = nameSimilarity(parts.surname, readingParts.surname);
    if (similarity > surnameSimilarity) {
      surnameSimilarity = similarity;
      given = readingParts.given;
      surnameDistance = nameDistance(parts.surname, readingParts.surname);
    }
  }
  // A card with nothing in common with the surname is not a candidate. Given name, tee or group
  // alone must not propose a player, and this keeps every candidate carrying a surname reason.
  if (surnameSimilarity <= 0) return null;

  let givenScore = 0;
  if (given !== "" && parts.given !== "") {
    if (given === parts.given) givenScore = 1;
    else if ((given[0] ?? "") === (parts.given[0] ?? "")) givenScore = 0.5;
  }

  const reasons: MatchReason[] = [];
  let score = SURNAME_WEIGHT * surnameSimilarity + GIVEN_WEIGHT * givenScore;

  const exactName = surnameSimilarity >= SAME_SURNAME && givenScore === 1;
  if (exactName) {
    reasons.push({ code: "exact-name", text: "name on the card matches the player" });
  } else if (surnameSimilarity >= SAME_SURNAME) {
    reasons.push({ code: "surname-exact", text: "surname matches" });
  } else {
    const oneOff = surnameDistance <= 1 + SCORE_EPSILON;
    reasons.push({
      code: "surname-close",
      text: oneOff ? "surname one letter off" : "surname close to the card",
    });
  }

  if (!exactName) {
    if (givenScore === 1) {
      reasons.push({ code: "given-name-match", text: "given name matches" });
    } else if (givenScore === 0.5) {
      reasons.push({
        code: "given-initial-match",
        text: "given name starts with the same letter",
      });
    }
  }

  if (sameTee(reading, player)) {
    score += TEE_BONUS;
    reasons.push({ code: "tee-match", text: "tee matches" });
  } else if (teeDisagrees(reading, player)) {
    score += TEE_PENALTY;
  }

  if (handicapClose(reading, player)) {
    score += HANDICAP_BONUS;
    reasons.push({
      code: "handicap-close",
      text: "handicap within 1 of the playing handicap",
    });
  }

  if (sameText(reading.group, player.group)) {
    score += GROUP_BONUS;
    reasons.push({ code: "same-group", text: "same group or start slot" });
  }

  return {
    playerId: player.playerId,
    name: player.name,
    score: Math.max(0, Math.min(1, score)),
    reasons,
    hasCard: player.hasCard === true,
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Proposes players for one card reading, best first. Returns at most `limit` candidates at or above
 * `minScore`. A blank card name returns nothing. The caller decides who the player is.
 */
export function matchPlayers(
  reading: CardReading,
  players: readonly RoundPlayer[],
  options?: MatchOptions,
): MatchCandidate[] {
  const readings = cardReadings(reading.name);
  if (readings.length === 0) return [];

  const requestedLimit = options?.limit ?? DEFAULT_LIMIT;
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.floor(requestedLimit))
    : DEFAULT_LIMIT;
  if (limit === 0) return [];

  const requestedFloor = options?.minScore ?? DEFAULT_MIN_SCORE;
  const minScore = Number.isFinite(requestedFloor) ? requestedFloor : DEFAULT_MIN_SCORE;

  const scored: Scored[] = [];
  for (const player of players) {
    const candidate = scorePlayer(reading, readings, player);
    if (candidate !== null) scored.push(candidate);
  }

  scored.sort(
    (left, right) =>
      right.score - left.score ||
      compareText(left.name, right.name) ||
      compareText(left.playerId, right.playerId),
  );

  return scored
    .filter((candidate) => candidate.score + SCORE_EPSILON >= minScore)
    .slice(0, limit)
    .map((candidate) => ({
      playerId: candidate.playerId,
      score: candidate.score,
      reasons: candidate.reasons,
      hasCard: candidate.hasCard,
    }));
}
