import { describe, expect, it } from "vitest";
import {
  type PublicTeamLeaderboardData,
  type PublicTeamPlayerRow,
} from "@/lib/data/public-team-leaderboard";
import { buildLeaderboardTeaser } from "./leaderboard-teaser";

/**
 * The teaser is fed the same payload the leaderboard page reads, so the fixtures are built the same
 * way: published player rows through `buildTeamLeaderboard`, never a finished standing.
 */

const roundOne = {
  roundId: "r1",
  dayNumber: 1,
  playDate: "2026-11-12",
  state: "final" as const,
  version: 1,
  publishedAt: "2026-11-12T08:20:00Z",
};

const roundTwo = {
  roundId: "r2",
  dayNumber: 2,
  playDate: "2026-11-13",
  state: "final" as const,
  version: 1,
  publishedAt: "2026-11-13T09:00:00Z",
};

function row(
  over: Partial<PublicTeamPlayerRow> & {
    playerId: string;
    playerName: string;
    pairKey: string;
  },
): PublicTeamPlayerRow {
  return {
    ...roundOne,
    side: null,
    flightName: "Class A",
    categoryName: "Regular",
    pairNumber: 1,
    grossStrokes: 80,
    netStrokes: 72,
    grossPoints: 30,
    netPoints: 38,
    holesCounted: 18,
    holesTotal: 18,
    parTotal: 72,
    ...over,
  };
}

function data(
  rows: PublicTeamPlayerRow[],
  rounds: PublicTeamLeaderboardData["rounds"] = [roundOne, roundTwo],
): PublicTeamLeaderboardData {
  return {
    tournamentId: "t1",
    eventName: "24th Bamboo Tee",
    tieBreak: null,
    rounds,
    rows,
  };
}

/** One complete pair over one round. The team totals are split between the two partners. */
function pair(
  pairKey: string,
  pairNumber: number,
  names: [string, string],
  points: { net: number; gross: number },
  round: PublicTeamLeaderboardData["rounds"][number] = roundOne,
): PublicTeamPlayerRow[] {
  const guestNet = Math.floor(points.net / 2);
  const guestGross = Math.floor(points.gross / 2);
  return [
    row({
      ...round,
      playerId: `${pairKey}:member`,
      playerName: names[0],
      pairKey,
      pairNumber,
      side: "member",
      netPoints: points.net - guestNet,
      grossPoints: points.gross - guestGross,
    }),
    row({
      ...round,
      playerId: `${pairKey}:guest`,
      playerName: names[1],
      pairKey,
      pairNumber,
      side: "guest",
      netPoints: guestNet,
      grossPoints: guestGross,
    }),
  ];
}

describe("buildLeaderboardTeaser", () => {
  it("keeps the ranks and ties the leaderboard gave the teams", () => {
    const rows = [
      ...pair("pair:1", 1, ["ANA, MARIA", "BEN, JOSE"], { net: 62, gross: 40 }),
      ...pair("pair:2", 2, ["CAT, LUZ", "DAN, PIO"], { net: 62, gross: 40 }),
      ...pair("pair:3", 3, ["EVE, ROSA", "FIN, TOM"], { net: 58, gross: 38 }),
    ];

    const teaser = buildLeaderboardTeaser(data(rows));

    expect(teaser?.teams.map((team) => [team.rank, team.tied])).toEqual([
      [1, true],
      [1, true],
      [3, false],
    ]);
    expect(teaser?.teams[0]).toMatchObject({
      rank: 1,
      tied: true,
      pairNumber: 1,
      names: ["ANA, MARIA", "BEN, JOSE"],
      netPoints: 62,
      grossPoints: 40,
    });
  });

  it("puts the member before the guest even when the payload lists the guest first", () => {
    const rows = pair("pair:1", 4, ["ANA, MARIA", "BEN, JOSE"], { net: 60, gross: 38 }).reverse();

    expect(buildLeaderboardTeaser(data(rows))?.teams[0]?.names).toEqual([
      "ANA, MARIA",
      "BEN, JOSE",
    ]);
  });

  it("stops at five teams by default and accepts a smaller limit", () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      pair(`pair:${index + 1}`, index + 1, [`M${index}`, `G${index}`], {
        net: 70 - index * 2,
        gross: 40 - index,
      }),
    ).flat();

    const teaser = buildLeaderboardTeaser(data(rows));

    expect(teaser?.teams.map((team) => team.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(buildLeaderboardTeaser(data(rows), 2)?.teams.map((team) => team.rank)).toEqual([1, 2]);
    expect(buildLeaderboardTeaser(data(rows), 0)).toBeNull();
  });

  it("marks the teaser provisional while any counted round is provisional", () => {
    const provisional = { ...roundTwo, state: "provisional" as const };
    const rows = [
      ...pair("pair:1", 1, ["ANA, MARIA", "BEN, JOSE"], { net: 31, gross: 20 }, roundOne),
      ...pair("pair:1", 1, ["ANA, MARIA", "BEN, JOSE"], { net: 31, gross: 20 }, provisional),
    ];

    expect(buildLeaderboardTeaser(data(rows, [roundOne, provisional]))?.state).toBe("provisional");
    expect(buildLeaderboardTeaser(data(rows))?.state).toBe("final");
  });

  it("dates the teaser from the latest publication, in Manila time", () => {
    const firstDayOnly = pair("pair:1", 1, ["ANA, MARIA", "BEN, JOSE"], { net: 62, gross: 40 });

    // 08:20 UTC is 4:20 PM in Manila.
    expect(buildLeaderboardTeaser(data(firstDayOnly))?.asOf).toBe("Nov 12, 4:20 PM");

    const bothDays = [
      ...firstDayOnly,
      ...pair("pair:1", 1, ["ANA, MARIA", "BEN, JOSE"], { net: 40, gross: 28 }, roundTwo),
    ];
    expect(buildLeaderboardTeaser(data(bothDays))?.asOf).toBe("Nov 13, 5:00 PM");
  });

  it("counts the highest day that actually has published rows", () => {
    const firstDayOnly = pair("pair:1", 1, ["ANA, MARIA", "BEN, JOSE"], { net: 62, gross: 40 });
    const bothDays = [
      ...firstDayOnly,
      ...pair("pair:1", 1, ["ANA, MARIA", "BEN, JOSE"], { net: 40, gross: 28 }, roundTwo),
    ];

    expect(buildLeaderboardTeaser(data(firstDayOnly))?.dayNumber).toBe(1);
    expect(buildLeaderboardTeaser(data(bothDays))?.dayNumber).toBe(2);
  });

  it("keeps the event name and leaves the time out when the date cannot be read", () => {
    const rows = pair(
      "pair:1",
      1,
      ["ANA, MARIA", "BEN, JOSE"],
      { net: 62, gross: 40 },
      { ...roundOne, publishedAt: "not a date" },
    );

    const teaser = buildLeaderboardTeaser(data(rows, [{ ...roundOne, publishedAt: "not a date" }]));

    expect(teaser).toMatchObject({
      eventName: "24th Bamboo Tee",
      dayNumber: 1,
      asOf: null,
      state: "final",
    });
  });

  it("returns null when nothing is ranked", () => {
    expect(buildLeaderboardTeaser(data([]))).toBeNull();

    // A published player without a complete pair is counted as unpaired, not ranked.
    const solo = [row({ playerId: "solo", playerName: "SOL, ONE", pairKey: "solo:solo" })];
    expect(buildLeaderboardTeaser(data(solo))).toBeNull();
  });
});
