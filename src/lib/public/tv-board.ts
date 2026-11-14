import type { PublicTeamLeaderboardData } from "@/lib/data/public-team-leaderboard";
import {
  buildPlayerScores,
  buildScoreRows,
  hasSessions,
  type PublicPlayerScore,
  type ScoreSession,
} from "./public-scores";
import { type ScoreStart, scoreSessionKey } from "./score-sessions";

/**
 * The clubhouse TV board.
 *
 * It answers three questions for a room full of members: which day is on screen, who played this
 * morning and who played this afternoon, and what each of them scored. The figures are the frozen
 * published ones, so the screen can never show a card the desk has not released.
 *
 * Pure: the caller passes the calendar day it considers "today". No I/O, no clock of its own.
 */

export interface TvDay {
  dayNumber: number;
  playDate: string;
}

/** One player's published figures for the day on screen. */
export interface TvPlayerLine {
  playerId: string;
  name: string;
  grossPoints: number | null;
  netPoints: number | null;
  holesCounted: number;
  holesTotal: number;
  pairNumber: number | null;
  flightName: string | null;
  /** The published tee time, "06:30", or null when the desk has not published a start. */
  teeTime: string | null;
  teeHole: number | null;
  rank: number;
  tied: boolean;
}

/** Two partners added together, or one player on their own when no pair number is published. */
export interface TvPairLine {
  key: string;
  pairNumber: number | null;
  names: string[];
  grossPoints: number | null;
  netPoints: number | null;
  /** The pair's earliest published tee time, so the team reads as one group. */
  teeTime: string | null;
  teeHole: number | null;
  rank: number;
  tied: boolean;
}

/**
 * One column of the screen. `session` is null when the desk has not published starts for the day,
 * in which case the column holds the whole day rather than inventing a morning and an afternoon.
 */
export interface TvColumn {
  session: ScoreSession | null;
  players: TvPlayerLine[];
  pairs: TvPairLine[];
}

export interface TvBoard {
  eventName: string | null;
  /** The day on screen, or null when no round has been published. */
  day: TvDay | null;
  /** True when the day on screen is the calendar day that was asked for. */
  isToday: boolean;
  columns: TvColumn[];
  /** Players on the day whose start is not in the published pairings, so a session cannot place them. */
  unplaced: number;
}

/** A sum of the values that exist; null only when there is nothing at all to add. */
function sumKnown(values: ReadonlyArray<number | null>): number | null {
  let total = 0;
  let seen = false;
  for (const value of values) {
    if (value === null) continue;
    total += value;
    seen = true;
  }
  return seen ? total : null;
}

/**
 * The calendar day in Manila as `YYYY-MM-DD`.
 *
 * The club, the field and the screen are all in Philippine time, so the board must not follow the
 * server's own zone. Built from parts rather than a locale string, because a locale's date order is
 * not a contract.
 */
export function manilaDateIso(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * The day to show.
 *
 * Today if a round for today is published. Otherwise the most recent published day, so a screen left
 * on overnight still shows the last scores rather than going blank, and the screen says so. Before
 * the event starts there is nothing published and no day is returned.
 */
export function pickTvDay(
  rounds: ReadonlyArray<{ dayNumber: number; playDate: string }>,
  todayIso: string,
): { day: TvDay | null; isToday: boolean } {
  const ordered = [...rounds].sort((a, b) => a.dayNumber - b.dayNumber);
  const exact = ordered.find((round) => round.playDate === todayIso);
  if (exact)
    return { day: { dayNumber: exact.dayNumber, playDate: exact.playDate }, isToday: true };

  const earlier = ordered.filter((round) => round.playDate < todayIso);
  const chosen = earlier[earlier.length - 1] ?? ordered[0];
  if (!chosen) return { day: null, isToday: false };
  return { day: { dayNumber: chosen.dayNumber, playDate: chosen.playDate }, isToday: false };
}

function startFor(
  score: PublicPlayerScore,
  starts: Readonly<Record<string, ScoreStart>>,
): ScoreStart | undefined {
  if (!score.playDate) return undefined;
  return starts[scoreSessionKey(score.playerId, score.playDate)];
}

function toPlayerLine(
  score: PublicPlayerScore,
  starts: Readonly<Record<string, ScoreStart>>,
): TvPlayerLine {
  const start = startFor(score, starts);
  return {
    playerId: score.playerId,
    name: score.name,
    grossPoints: score.grossPoints,
    netPoints: score.netPoints,
    holesCounted: score.holesCounted,
    holesTotal: score.holesTotal,
    pairNumber: score.pairNumber,
    flightName: score.flightName,
    teeTime: start?.time ?? null,
    teeHole: start?.hole ?? null,
    rank: score.rank,
    tied: score.tied,
  };
}

/**
 * Adds the partners together. A pair number is the desk's own key, so two players sharing one are
 * one line; a player with no published pair keeps their own line instead of disappearing.
 */
function toPairLines(
  scores: readonly PublicPlayerScore[],
  starts: Readonly<Record<string, ScoreStart>>,
): TvPairLine[] {
  const groups = new Map<string, PublicPlayerScore[]>();
  for (const score of scores) {
    const key = score.pairNumber === null ? `player:${score.playerId}` : `pair:${score.pairNumber}`;
    const group = groups.get(key) ?? [];
    group.push(score);
    groups.set(key, group);
  }

  const lines: TvPairLine[] = [];
  for (const [key, group] of groups) {
    const first = group[0];
    if (!first) continue;
    const earliest = group
      .map((score) => startFor(score, starts))
      .filter((start): start is ScoreStart => start !== undefined)
      .sort((a, b) => a.time.localeCompare(b.time))[0];
    lines.push({
      key,
      pairNumber: first.pairNumber,
      names: group.map((score) => score.name),
      grossPoints: sumKnown(group.map((score) => score.grossPoints)),
      netPoints: sumKnown(group.map((score) => score.netPoints)),
      teeTime: earliest?.time ?? null,
      teeHole: earliest?.hole ?? null,
      rank: 0,
      tied: false,
    });
  }
  return rankPairs(lines);
}

/** Net points, then gross points, then the names. Equal figures keep the same rank. */
function rankPairs(lines: TvPairLine[]): TvPairLine[] {
  const sorted = [...lines].sort((a, b) => {
    if (a.netPoints !== b.netPoints) {
      if (a.netPoints === null) return 1;
      if (b.netPoints === null) return -1;
      return b.netPoints - a.netPoints;
    }
    if (a.grossPoints !== b.grossPoints) {
      if (a.grossPoints === null) return 1;
      if (b.grossPoints === null) return -1;
      return b.grossPoints - a.grossPoints;
    }
    return a.names.join(" / ").localeCompare(b.names.join(" / "));
  });

  const ranked: TvPairLine[] = [];
  for (const [index, line] of sorted.entries()) {
    const previous = sorted[index - 1];
    const tied =
      previous !== undefined &&
      previous.netPoints === line.netPoints &&
      previous.grossPoints === line.grossPoints;
    const rank = tied ? (ranked[index - 1]?.rank ?? index + 1) : index + 1;
    ranked.push({ ...line, rank, tied });
    const before = ranked[index - 1];
    if (tied && before) ranked[index - 1] = { ...before, tied: true };
  }
  return ranked;
}

function columnFor(
  rows: ReturnType<typeof buildScoreRows>,
  dayNumber: number,
  session: ScoreSession | null,
  starts: Readonly<Record<string, ScoreStart>>,
): TvColumn {
  const scored = buildPlayerScores(rows, { day: dayNumber, session });
  return {
    session,
    players: scored.scores.map((score) => toPlayerLine(score, starts)),
    pairs: toPairLines(scored.scores, starts),
  };
}

/**
 * The whole screen from one published payload plus the session lookup the results page already
 * builds. When the desk has not published starts, the day is one column rather than an empty
 * morning and an empty afternoon.
 */
export function buildTvBoard(
  data: PublicTeamLeaderboardData,
  sessions: Readonly<Record<string, ScoreSession>>,
  todayIso: string,
  starts: Readonly<Record<string, ScoreStart>> = {},
): TvBoard {
  const rows = buildScoreRows(data, sessions);
  // Only a day that actually has published cards can be the board's day. A round published ahead
  // of its first card, or an empty publication, must not blank the screen while an earlier day's
  // cards are still on the board.
  const played = data.rounds.filter((round) =>
    rows.some((row) => row.dayNumber === round.dayNumber),
  );
  const { day, isToday } = pickTvDay(played.length > 0 ? played : data.rounds, todayIso);
  if (!day) {
    return { eventName: data.eventName, day: null, isToday: false, columns: [], unplaced: 0 };
  }

  const onDay = rows.filter((row) => row.dayNumber === day.dayNumber);
  if (onDay.length === 0) {
    return { eventName: data.eventName, day, isToday, columns: [], unplaced: 0 };
  }

  if (!hasSessions(onDay)) {
    return {
      eventName: data.eventName,
      day,
      isToday,
      columns: [columnFor(rows, day.dayNumber, null, starts)],
      unplaced: 0,
    };
  }

  const morning = columnFor(rows, day.dayNumber, "AM", starts);
  const afternoon = columnFor(rows, day.dayNumber, "PM", starts);
  const placed = new Set([...morning.players, ...afternoon.players].map((line) => line.playerId));

  return {
    eventName: data.eventName,
    day,
    isToday,
    columns: [morning, afternoon],
    unplaced: onDay.filter((row) => !placed.has(row.playerId)).length,
  };
}
