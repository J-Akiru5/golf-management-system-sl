/**
 * The landing page teaser for the public team leaderboard.
 *
 * This module is pure: it takes the payload the leaderboard page already reads and reduces it to
 * the few values the landing page shows. It reads no clock and performs no I/O, so the same payload
 * always produces the same teaser. The "as of" line is the publication time the desk recorded,
 * formatted in the club's timezone.
 */

import {
  buildTeamLeaderboard,
  type PublicTeamLeaderboardData,
  type PublicTeamState,
  topTeams,
} from "@/lib/data/public-team-leaderboard";

/** One team in the teaser: its place and the points the desk published. */
export interface LeaderboardTeaserTeam {
  rank: number;
  tied: boolean;
  pairNumber: number | null;
  /** The member and guest names, member first, exactly as the leaderboard shows them. */
  names: string[];
  netPoints: number | null;
  grossPoints: number | null;
}

export interface LeaderboardTeaser {
  eventName: string | null;
  /** The highest day number among the rounds that have published rows. */
  dayNumber: number;
  /** The latest publication time, in Philippine time. Null when no date could be read. */
  asOf: string | null;
  state: PublicTeamState;
  teams: LeaderboardTeaserTeam[];
}

/** "Nov 12, 4:20 PM". Fixed timezone and locale, so every reader sees the club's clock. */
const asOfFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** The fields the teaser needs from a round. A player row carries the same three. */
type CountedRound = {
  dayNumber: number;
  state: PublicTeamState;
  publishedAt: string;
};

/** The newest readable timestamp, or null when every value is missing or malformed. */
function latestPublishedAt(values: string[]): number | null {
  let latest: number | null = null;
  for (const value of values) {
    const at = Date.parse(value);
    if (Number.isNaN(at)) continue;
    if (latest === null || at > latest) latest = at;
  }
  return latest;
}

/**
 * The top teams, ready for the landing page.
 *
 * Returns null when nothing is ranked, which includes an event with no published scores and one
 * whose pairs are still incomplete. The page then shows no section at all rather than an empty
 * table.
 */
export function buildLeaderboardTeaser(
  data: PublicTeamLeaderboardData,
  limit = 5,
): LeaderboardTeaser | null {
  const teams = topTeams(buildTeamLeaderboard(data).teams, limit);
  if (teams.length === 0) return null;

  // A round counts once it has published rows. A row knows its own day, so a payload that lists
  // rows without their round still dates itself.
  const publishedRoundIds = new Set(data.rows.map((row) => row.roundId));
  const rounds: CountedRound[] = data.rounds.filter((round) =>
    publishedRoundIds.has(round.roundId),
  );
  const counted: CountedRound[] = rounds.length > 0 ? rounds : data.rows;

  const dayNumber = Math.max(...counted.map((round) => round.dayNumber));
  const state: PublicTeamState = counted.some((round) => round.state === "provisional")
    ? "provisional"
    : "final";

  const latest = latestPublishedAt(counted.map((round) => round.publishedAt));

  return {
    eventName: data.eventName,
    dayNumber,
    asOf: latest === null ? null : asOfFormat.format(latest),
    state,
    teams: teams.map((team) => ({
      rank: team.rank,
      tied: team.tied,
      pairNumber: team.pairNumber,
      names: team.members.map((member) => member.name).filter((name) => name.trim() !== ""),
      netPoints: team.netPoints,
      grossPoints: team.grossPoints,
    })),
  };
}
