import { describe, expect, it } from "vitest";
import {
  buildTeamLeaderboard,
  filterTeams,
  type PublicTeamLeaderboardData,
  type PublicTeamPlayerRow,
  type PublicTeamStanding,
  parsePublicTeamLeaderboard,
  rankTeams,
  teamOptions,
  topTeams,
} from "./public-team-leaderboard";

const roundOne = {
  roundId: "r1",
  dayNumber: 1,
  playDate: "2026-11-12",
  state: "final" as const,
  version: 1,
  publishedAt: "2026-11-12T10:00:00Z",
};

const roundTwo = {
  roundId: "r2",
  dayNumber: 2,
  playDate: "2026-11-13",
  state: "final" as const,
  version: 1,
  publishedAt: "2026-11-13T10:00:00Z",
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

function data(rows: PublicTeamPlayerRow[] = []): PublicTeamLeaderboardData {
  return {
    tournamentId: "t1",
    eventName: "Bamboo Tee",
    tieBreak: {
      name: "IGCC countback",
      procedure: "Net team points on holes 16-18, then 13-15, then lots.",
      version: "1",
    },
    rounds: [roundOne, roundTwo],
    rows,
  };
}

describe("parsePublicTeamLeaderboard", () => {
  it("keeps the published rows and rounds", () => {
    const parsed = parsePublicTeamLeaderboard({
      tournamentId: "t1",
      eventName: "Bamboo Tee",
      tieBreak: { name: "IGCC", procedure: "Holes 16-18", version: "1" },
      rounds: [roundTwo, roundOne],
      rows: [row({ playerId: "a", playerName: "Ana", pairKey: "pair:1" })],
    });

    expect(parsed?.rounds.map((item) => item.dayNumber)).toEqual([1, 2]);
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.rows[0]?.playerName).toBe("ANA");
    expect(parsed?.tieBreak?.procedure).toBe("Holes 16-18");
  });

  it("returns null for a missing or malformed payload", () => {
    expect(parsePublicTeamLeaderboard(null)).toBeNull();
    expect(parsePublicTeamLeaderboard({ rounds: [], rows: "nope" })).toBeNull();
    expect(parsePublicTeamLeaderboard({ rounds: [{}], rows: [] })).toEqual({
      tournamentId: null,
      eventName: null,
      tieBreak: null,
      rounds: [],
      rows: [],
    });
  });
});

describe("buildTeamLeaderboard", () => {
  it("adds both partners across every published round", () => {
    const rows = [
      row({ playerId: "a", playerName: "Ana", pairKey: "pair:1" }),
      row({ playerId: "b", playerName: "Ben", pairKey: "pair:1" }),
      row({ ...roundTwo, playerId: "a", playerName: "Ana", pairKey: "pair:1" }),
      row({ ...roundTwo, playerId: "b", playerName: "Ben", pairKey: "pair:1" }),
    ];
    const { teams, unpaired } = buildTeamLeaderboard(data(rows));

    expect(unpaired).toBe(0);
    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({
      name: "Ana / Ben",
      pairNumber: 1,
      holesCounted: 36,
      holesTotal: 36,
      grossStrokes: 320,
      netStrokes: 288,
      grossPoints: 120,
      netPoints: 152,
      roundsCounted: 2,
      rank: 1,
      tied: false,
    });
    expect(teams[0]?.toPar).toBe("+32");
  });

  it("counts a player without a complete pair and does not rank them", () => {
    const rows = [row({ playerId: "solo", playerName: "Sol", pairKey: "solo:solo" })];
    const { teams, unpaired } = buildTeamLeaderboard(data(rows));

    expect(teams).toEqual([]);
    expect(unpaired).toBe(1);
  });

  it("keeps a team's class and both categories", () => {
    const rows = [
      row({
        playerId: "a",
        playerName: "Ana",
        pairKey: "pair:1",
        categoryName: "Ladies",
        flightName: "Class A",
      }),
      row({
        playerId: "b",
        playerName: "Ben",
        pairKey: "pair:1",
        categoryName: "Senior",
        flightName: "Class A",
      }),
    ];
    const { teams } = buildTeamLeaderboard(data(rows));

    expect(teams[0]?.flightName).toBe("Class A");
    expect(teams[0]?.categories).toEqual(["Ladies", "Senior"]);
  });
});

describe("ranking and filters", () => {
  function standing(over: Partial<PublicTeamStanding> & { key: string; name: string }) {
    return {
      pairNumber: 1,
      playerNames: [over.name],
      playerIds: [over.key],
      flightName: "Class A",
      categories: ["Regular"],
      holesCounted: 18,
      holesTotal: 18,
      grossStrokes: 80,
      netStrokes: 72,
      parTotal: 72,
      grossPoints: 30,
      netPoints: 38,
      toPar: "+8",
      roundsCounted: 1,
      rank: 0,
      tied: false,
      ...over,
    } satisfies PublicTeamStanding;
  }

  it("shares a rank on equal net and gross points, then skips the next rank", () => {
    const ranked = rankTeams([
      standing({ key: "a", name: "A", netPoints: 40 }),
      standing({ key: "b", name: "B", netPoints: 40 }),
      standing({ key: "c", name: "C", netPoints: 36 }),
    ]);

    expect(ranked.map((team) => [team.name, team.rank, team.tied])).toEqual([
      ["A", 1, true],
      ["B", 1, true],
      ["C", 3, false],
    ]);
  });

  it("puts a missing net score last", () => {
    const ranked = rankTeams([
      standing({ key: "a", name: "A", netPoints: null }),
      standing({ key: "b", name: "B", netPoints: 20 }),
    ]);
    expect(ranked.map((team) => team.name)).toEqual(["B", "A"]);
  });

  it("filters by either partner's category and by the team's class", () => {
    const teams = [
      standing({ key: "a", name: "A", categories: ["Ladies"], flightName: "Class A" }),
      standing({ key: "b", name: "B", categories: ["Senior"], flightName: "Class B" }),
    ];

    expect(filterTeams(teams, { category: "Ladies" }).map((team) => team.name)).toEqual(["A"]);
    expect(filterTeams(teams, { flight: "Class B" }).map((team) => team.name)).toEqual(["B"]);
    expect(filterTeams(teams, { category: "Ladies", flight: "Class B" })).toEqual([]);
  });

  it("re-ranks inside the selected class instead of keeping the overall rank", () => {
    const teams = [
      standing({ key: "a", name: "A", netPoints: 50, flightName: "Class A" }),
      standing({ key: "b", name: "B", netPoints: 40, flightName: "Class B" }),
      standing({ key: "c", name: "C", netPoints: 30, flightName: "Class B" }),
    ];
    const ranked = rankTeams(filterTeams(teams, { flight: "Class B" }));

    expect(ranked.map((team) => [team.name, team.rank])).toEqual([
      ["B", 1],
      ["C", 2],
    ]);
  });

  it("stops the table at ten teams", () => {
    const teams = Array.from({ length: 14 }, (_, index) =>
      standing({ key: `p${index}`, name: `Team ${index}` }),
    );
    expect(topTeams(teams)).toHaveLength(10);
    expect(topTeams(teams, 3)).toHaveLength(3);
  });

  it("lists the category and class options once, sorted", () => {
    const options = teamOptions(
      data([
        row({ playerId: "a", playerName: "Ana", pairKey: "pair:1", categoryName: "Senior" }),
        row({ playerId: "b", playerName: "Ben", pairKey: "pair:1", categoryName: "Senior" }),
        row({
          playerId: "c",
          playerName: "Cat",
          pairKey: "pair:2",
          categoryName: "Ladies",
          flightName: "Class B",
        }),
      ]),
    );

    expect(options.categories).toEqual(["Ladies", "Senior"]);
    expect(options.flights).toEqual(["Class A", "Class B"]);
  });
});
