import { describe, expect, it } from "vitest";
import { parsePublicPlayerProfile, searchProfilePlayers } from "./public-profile";

const card = {
  playerId: "p1",
  playerName: "Ana Reyes",
  flightName: "Class A",
  playingHandicap: 12,
  courseHandicap: 13,
  grossStrokes: 80,
  netStrokes: 68,
  grossPoints: 28,
  netPoints: 40,
  holesCounted: 2,
  holesTotal: 18,
  holes: [
    {
      hole: 1,
      par: 4,
      strokeIndex: 1,
      grossStrokes: 5,
      handicapStrokes: 1,
      netStrokes: 4,
      grossPoints: 1,
      netPoints: 2,
    },
    {
      hole: 2,
      par: 3,
      strokeIndex: 2,
      grossStrokes: 3,
      handicapStrokes: 1,
      netStrokes: 2,
      grossPoints: 2,
      netPoints: 3,
    },
  ],
  roundId: "r1",
  dayNumber: 1,
  playDate: "2026-11-12",
  state: "final",
  version: 2,
  publishedAt: "2026-11-12T10:00:00Z",
};

describe("parsePublicPlayerProfile", () => {
  it("keeps the player, partner and frozen cards", () => {
    const parsed = parsePublicPlayerProfile({
      tournamentId: "t1",
      player: {
        id: "p1",
        name: "Ana Reyes",
        index: 11.2,
        category: "Ladies",
        flight: "Class A",
        pairNumber: 4,
      },
      partner: { id: "p2", name: "Bea Cruz" },
      cards: [card],
    });

    expect(parsed?.player).toEqual({
      id: "p1",
      name: "ANA REYES",
      index: 11.2,
      category: "Ladies",
      flight: "Class A",
      pairNumber: 4,
    });
    expect(parsed?.partner).toEqual({ id: "p2", name: "BEA CRUZ" });
    expect(parsed?.cards).toHaveLength(1);
    expect(parsed?.cards[0]?.holes).toHaveLength(2);
  });

  it("returns null when the database did not find a confirmed player", () => {
    expect(parsePublicPlayerProfile(null)).toBeNull();
    expect(parsePublicPlayerProfile({})).toBeNull();
    expect(parsePublicPlayerProfile({ player: { id: "p1" } })).toBeNull();
  });

  it("keeps a profile with no cards and no partner", () => {
    const parsed = parsePublicPlayerProfile({
      player: { id: "p1", name: "Ana Reyes" },
      cards: [],
    });

    expect(parsed?.cards).toEqual([]);
    expect(parsed?.partner).toBeNull();
  });
});

describe("searchProfilePlayers", () => {
  const players = [
    { id: "p1", name: "Antonio Alcantara", category: "Regular", flight: "Class A" },
    { id: "p2", name: "José Peña", category: "Senior", flight: "Class B" },
    { id: "p3", name: "Maria Santos", category: "Ladies", flight: "Class A" },
    { id: null, name: "Old Snapshot", category: null, flight: null },
  ];

  it("matches a partial name without accents or case", () => {
    expect(searchProfilePlayers(players, "pena").map((player) => player.name)).toEqual([
      "José Peña",
    ]);
    expect(searchProfilePlayers(players, "  ANTON  ").map((player) => player.name)).toEqual([
      "Antonio Alcantara",
    ]);
  });

  it("returns nothing until someone types and never lists an old snapshot without an id", () => {
    expect(searchProfilePlayers(players, "")).toEqual([]);
    expect(searchProfilePlayers(players, "old")).toEqual([]);
  });

  it("stops at the limit so a phone does not render the whole field", () => {
    expect(searchProfilePlayers(players, "a", 1)).toHaveLength(1);
  });
});
