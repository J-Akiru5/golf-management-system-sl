/**
 * The printed scores leaderboard: one pair per two rows, member first and guest second.
 *
 * It is built from the desk's pairings and the same net Stableford totals the scoring engine
 * already derived. The module is pure so the print sheet can be tested without a browser or a
 * database. Days are the event's playing days, in day order; a day the player did not play is a
 * dash, never a zero.
 */

export interface LeaderboardDay {
  dayNumber: number;
  /** "Day 1" or the event's own label. */
  label: string;
  /** Short date under the day label, or null when the day has no date. */
  dateLabel: string | null;
}

export interface LeaderboardCell {
  /** Net Stableford points that day, or null when there is no card or no result. */
  points: number | null;
  /** The session recorded for that player on that day. Null when it is not known. */
  session: "AM" | "PM" | null;
}

export interface LeaderboardPlayer {
  playerId: string | null;
  name: string;
  side: "member" | "guest";
  /** The course handicap the event scores this player from, or null. */
  courseHandicap: number | null;
  /** One entry per day, in the same order as the sheet's days. */
  cells: LeaderboardCell[];
  /** Filled by `buildLeaderboardSheet`. Null when no day has a result. */
  total?: number | null;
}

export interface LeaderboardPair {
  pairNumber: number | null;
  className: string | null;
  member: LeaderboardPlayer;
  guest: LeaderboardPlayer;
  /** Filled by `buildLeaderboardSheet`: both partners' net points added together. */
  teamTotal?: number | null;
}

export interface LeaderboardSheet {
  eventName: string;
  /** "15 Nov 2026, 10:32 AM" as the sheet is printed. */
  asOf: string;
  days: LeaderboardDay[];
  /** Leaderboard order: highest team total first. */
  pairs: LeaderboardPair[];
}

/** A player's total is the sum of the days with a result. No result anywhere is null, not zero. */
export function playerTotal(cells: readonly LeaderboardCell[]): number | null {
  const values = cells
    .map((cell) => cell.points)
    .filter((points): points is number => points !== null);
  return values.length === 0 ? null : values.reduce((sum, points) => sum + points, 0);
}

/** Both partners together. One partner with no result contributes nothing, not a zero row. */
export function pairTotal(pair: LeaderboardPair): number | null {
  const values = [pair.member.total, pair.guest.total].filter(
    (total): total is number => typeof total === "number",
  );
  return values.length === 0 ? null : values.reduce((sum, total) => sum + total, 0);
}

/** The order a leaderboard is printed in. A pair with no result goes last. */
export function orderPairs(pairs: readonly LeaderboardPair[]): LeaderboardPair[] {
  return [...pairs].sort((a, b) => {
    const aTotal = a.teamTotal;
    const bTotal = b.teamTotal;
    if (aTotal !== bTotal) {
      if (aTotal === null || aTotal === undefined) return 1;
      if (bTotal === null || bTotal === undefined) return -1;
      return bTotal - aTotal;
    }
    const aNumber = a.pairNumber ?? Number.POSITIVE_INFINITY;
    const bNumber = b.pairNumber ?? Number.POSITIVE_INFINITY;
    if (aNumber !== bNumber) return aNumber - bNumber;
    return a.member.name.localeCompare(b.member.name) || a.guest.name.localeCompare(b.guest.name);
  });
}

/** Completes the player and team totals, then puts the pairs in leaderboard order. */
export function buildLeaderboardSheet(input: {
  eventName: string;
  asOf: string;
  days: readonly LeaderboardDay[];
  pairs: readonly LeaderboardPair[];
}): LeaderboardSheet {
  const pairs = input.pairs.map((pair) => {
    const member = { ...pair.member, total: playerTotal(pair.member.cells) };
    const guest = { ...pair.guest, total: playerTotal(pair.guest.cells) };
    const withTotals: LeaderboardPair = { ...pair, member, guest };
    return { ...withTotals, teamTotal: pairTotal(withTotals) };
  });
  return {
    eventName: input.eventName,
    asOf: input.asOf,
    days: [...input.days],
    pairs: orderPairs(pairs),
  };
}

/** "32" or "—". A zero is a real score and prints as 0. */
export function formatPoints(points: number | null): string {
  return points === null ? "—" : String(points);
}
