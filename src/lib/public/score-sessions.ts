import { sessionForTime } from "@/lib/data/sessions";
import type { ScoreSession } from "@/lib/public/public-scores";

/**
 * Which session each player started in on each published day, and at what time, read from the
 * published pairings.
 *
 * The leaderboard's published rows carry a day but not a start, and the pairings carry the start.
 * Joining them here means the All scores page needs no schema change: if the pairings are released,
 * the morning/afternoon filter works; if the desk holds them, every player simply has no session and
 * the page hides the filter rather than guessing.
 *
 * `sessionForTime` is the same rule the pairings page uses to print "Morning" and "Afternoon", so the
 * last day's 11:30 start reads Afternoon on both pages.
 */

/** The key both sides agree on: one player on one calendar day. */
export function scoreSessionKey(playerId: string, playDate: string): string {
  return `${playerId}|${playDate}`;
}

/** The fields of a published group this join needs. Structural, so the store type is not imported. */
export interface ScorePairingGroup {
  time: string;
  dayNumber?: number | null;
  playDate?: string | null;
  /** Player ids, parallel to the group's names. */
  playerIds?: readonly string[];
  /** The hole the group starts on, when the snapshot carries one. */
  startHole?: number | null;
}

/** A player's published start on one day. */
export interface ScoreStart {
  /** The tee time as the published snapshot stores it, "06:30". */
  time: string;
  /** The starting hole, or null when the snapshot does not carry one. */
  hole: number | null;
}

/** Which calendar date each playing day was played on. */
function playDatesByDay(groups: readonly ScorePairingGroup[]): Map<number, string> {
  const byDay = new Map<number, string>();
  for (const group of groups) {
    if (typeof group.dayNumber === "number" && group.playDate) {
      byDay.set(group.dayNumber, group.playDate);
    }
  }
  return byDay;
}

/** A lookup keyed by `scoreSessionKey`, ready for `buildScoreRows`. */
export function buildScoreSessions(
  groups: readonly ScorePairingGroup[],
): Record<string, ScoreSession> {
  const playDateByDay = playDatesByDay(groups);
  const orderedDays = [...playDateByDay.keys()].sort((a, b) => a - b);
  const indexOfDay = new Map(orderedDays.map((day, index) => [day, index]));
  const dayCount = Math.max(1, orderedDays.length);
  const fallbackDay = orderedDays[0];

  const sessions: Record<string, ScoreSession> = {};
  for (const group of groups) {
    const dayNumber = typeof group.dayNumber === "number" ? group.dayNumber : fallbackDay;
    if (dayNumber === undefined) continue;
    const playDate = playDateByDay.get(dayNumber);
    if (!playDate) continue;
    const key = sessionForTime(group.time || null, indexOfDay.get(dayNumber) ?? 0, dayCount)?.key;
    if (key !== "AM" && key !== "PM") continue;
    for (const playerId of group.playerIds ?? []) {
      if (!playerId) continue;
      sessions[scoreSessionKey(playerId, playDate)] = key;
    }
  }
  return sessions;
}

/**
 * Every player's tee time and starting hole on each published day.
 *
 * The same key as the sessions, so a screen can show the session and the tee time from one read.
 * Groups without a time, or without a day that has a date, are left out rather than given a guess.
 */
export function buildScoreStarts(groups: readonly ScorePairingGroup[]): Record<string, ScoreStart> {
  const playDateByDay = playDatesByDay(groups);
  const fallbackDay = [...playDateByDay.keys()].sort((a, b) => a - b)[0];

  const starts: Record<string, ScoreStart> = {};
  for (const group of groups) {
    const time = (group.time ?? "").slice(0, 5);
    if (!time) continue;
    const dayNumber = typeof group.dayNumber === "number" ? group.dayNumber : fallbackDay;
    if (dayNumber === undefined) continue;
    const playDate = playDateByDay.get(dayNumber);
    if (!playDate) continue;
    const start: ScoreStart = { time, hole: group.startHole ?? null };
    for (const playerId of group.playerIds ?? []) {
      if (!playerId) continue;
      starts[scoreSessionKey(playerId, playDate)] = start;
    }
  }
  return starts;
}
