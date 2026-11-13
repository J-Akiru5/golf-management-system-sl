import type { PublicTeamLeaderboardData } from "@/lib/data/public-team-leaderboard";
import { matchesName } from "@/lib/name-match";

/**
 * The public "All scores" board: one row per player per published round, then a player's own total.
 *
 * It is built from the same frozen publication the team board reads, so it can never show a live or
 * unverified score. What it adds is coverage: every player who has a published card, including the
 * players the two-man team table drops, and the ability to narrow to a day and a session.
 *
 * Pure. No I/O, no clock, no formatting: the caller supplies the session for each player and day.
 */

/** Morning or afternoon, as the pairings page labels a group. */
export type ScoreSession = "AM" | "PM";

/** One playing day that has a published round. */
export interface PublicScoreDay {
  dayNumber: number;
  playDate: string;
}

/** One player's published figures for one round. */
export interface PublicScoreRow {
  /** Player id and round id: unique, and stable across re-renders. */
  key: string;
  playerId: string;
  name: string;
  dayNumber: number;
  playDate: string;
  /** The published start's session, or null when the pairings are held or the player has no start. */
  session: ScoreSession | null;
  pairNumber: number | null;
  flightName: string | null;
  grossPoints: number | null;
  netPoints: number | null;
  grossStrokes: number | null;
  netStrokes: number | null;
  holesCounted: number;
  holesTotal: number;
}

/** One published round of a player's line, so the board can print the morning and afternoon scores. */
export interface PublicRoundScore {
  dayNumber: number;
  playDate: string;
  session: ScoreSession | null;
  grossPoints: number | null;
  netPoints: number | null;
  holesCounted: number;
  holesTotal: number;
}

/** A line on the board: one player on one day, or one player across every published round. */
export interface PublicPlayerScore {
  playerId: string;
  name: string;
  /** Null when this line totals every published round. */
  dayNumber: number | null;
  playDate: string | null;
  session: ScoreSession | null;
  /** How many published rounds the line covers. */
  rounds: number;
  /** Each counted round, in day order, with its own session and points. Never empty. */
  roundScores: PublicRoundScore[];
  grossPoints: number | null;
  netPoints: number | null;
  grossStrokes: number | null;
  netStrokes: number | null;
  holesCounted: number;
  holesTotal: number;
  pairNumber: number | null;
  flightName: string | null;
  rank: number;
  tied: boolean;
}

export interface PublicScoresFilter {
  /** Null or omitted means every published day. */
  day?: number | null;
  /** Null or omitted means both sessions. Ignored when no session was recorded. */
  session?: ScoreSession | null;
}

export interface PublicScores {
  scores: PublicPlayerScore[];
  /** Rows on the chosen day with no recorded start, which a session filter therefore drops. */
  withoutSession: number;
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

/** The days that have a published round, in the order they were played. */
export function scoreDays(data: PublicTeamLeaderboardData): PublicScoreDay[] {
  return [...data.rounds]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((round) => ({ dayNumber: round.dayNumber, playDate: round.playDate }));
}

/**
 * Flattens the published player rows and attaches the start's session.
 *
 * The session comes from the published pairings, keyed by player and date, so a player who did not
 * appear in that day's pairings keeps a null session rather than borrowing someone else's.
 */
export function buildScoreRows(
  data: PublicTeamLeaderboardData,
  sessions: Readonly<Record<string, ScoreSession>>,
): PublicScoreRow[] {
  const rows: PublicScoreRow[] = [];
  for (const row of data.rows) {
    rows.push({
      key: `${row.playerId}|${row.roundId}`,
      playerId: row.playerId,
      name: row.playerName,
      dayNumber: row.dayNumber,
      playDate: row.playDate,
      session: sessions[`${row.playerId}|${row.playDate}`] ?? null,
      pairNumber: row.pairNumber,
      flightName: row.flightName,
      grossPoints: row.grossPoints,
      netPoints: row.netPoints,
      grossStrokes: row.grossStrokes,
      netStrokes: row.netStrokes,
      holesCounted: row.holesCounted,
      holesTotal: row.holesTotal,
    });
  }
  return rows;
}

/** True when at least one row knows its session, so the page can offer the morning/afternoon split. */
export function hasSessions(rows: readonly PublicScoreRow[]): boolean {
  return rows.some((row) => row.session !== null);
}

function sameRank(a: PublicPlayerScore, b: PublicPlayerScore): boolean {
  return a.netPoints === b.netPoints && a.grossPoints === b.grossPoints;
}

/**
 * Net points first, then gross points, then the name. Equal figures keep the same rank, so the board
 * never invents an order between two players who scored the same.
 */
export function rankPlayerScores(scores: readonly PublicPlayerScore[]): PublicPlayerScore[] {
  const sorted = [...scores].sort((a, b) => {
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
    return a.name.localeCompare(b.name);
  });

  const ranked: PublicPlayerScore[] = [];
  for (const [index, score] of sorted.entries()) {
    const previous = sorted[index - 1];
    const tied = previous !== undefined && sameRank(previous, score);
    const rank = tied ? (ranked[index - 1]?.rank ?? index + 1) : index + 1;
    ranked.push({ ...score, rank, tied });
  }
  // Both players in a tie are marked, not only the one that came second.
  const shared = new Map<number, number>();
  for (const score of ranked) shared.set(score.rank, (shared.get(score.rank) ?? 0) + 1);
  return ranked.map((score) => ({ ...score, tied: (shared.get(score.rank) ?? 0) > 1 }));
}

/**
 * The board for the chosen day and session.
 *
 * With no day it totals every published round per player. With a day it lists that day's players.
 * A session filter drops rows whose start is not recorded; `withoutSession` says how many were left
 * out, so the page can explain the gap instead of silently shortening the field.
 */
export function buildPlayerScores(
  rows: readonly PublicScoreRow[],
  filter: PublicScoresFilter = {},
): PublicScores {
  const day = filter.day ?? null;
  const session = filter.session ?? null;
  const onDay = rows.filter((row) => day === null || row.dayNumber === day);
  const matching = onDay.filter((row) => session === null || row.session === session);
  const withoutSession = session === null ? 0 : onDay.filter((row) => row.session === null).length;

  const byPlayer = new Map<string, PublicScoreRow[]>();
  for (const row of matching) {
    const group = byPlayer.get(row.playerId) ?? [];
    group.push(row);
    byPlayer.set(row.playerId, group);
  }

  const scores: PublicPlayerScore[] = [];
  for (const [playerId, playerRows] of byPlayer) {
    const ordered = [...playerRows].sort((a, b) => a.dayNumber - b.dayNumber);
    const latest = ordered[ordered.length - 1];
    if (!latest) continue;
    const sessions = new Set(ordered.map((row) => row.session));
    const onlySession = sessions.size === 1 ? ([...sessions][0] ?? null) : null;
    scores.push({
      playerId,
      name: latest.name,
      dayNumber: day,
      playDate: day === null ? null : latest.playDate,
      session: onlySession,
      rounds: ordered.length,
      roundScores: ordered.map((row) => ({
        dayNumber: row.dayNumber,
        playDate: row.playDate,
        session: row.session,
        grossPoints: row.grossPoints,
        netPoints: row.netPoints,
        holesCounted: row.holesCounted,
        holesTotal: row.holesTotal,
      })),
      grossPoints: sumKnown(ordered.map((row) => row.grossPoints)),
      netPoints: sumKnown(ordered.map((row) => row.netPoints)),
      grossStrokes: sumKnown(ordered.map((row) => row.grossStrokes)),
      netStrokes: sumKnown(ordered.map((row) => row.netStrokes)),
      holesCounted: ordered.reduce((total, row) => total + row.holesCounted, 0),
      holesTotal: ordered.reduce((total, row) => total + row.holesTotal, 0),
      pairNumber: latest.pairNumber,
      flightName: latest.flightName,
      rank: 0,
      tied: false,
    });
  }

  return { scores: rankPlayerScores(scores), withoutSession };
}

/** The name search. Words, not the whole line, so "chrysler anne" finds "PALIC, CHRYSLER ANNE". */
export function filterPlayerScores(
  scores: readonly PublicPlayerScore[],
  query: string,
): PublicPlayerScore[] {
  const wanted = query.trim();
  if (wanted === "") return [...scores];
  return scores.filter((score) => matchesName(score.name, wanted));
}
