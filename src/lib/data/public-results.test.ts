import { describe, expect, it } from "vitest";
import { type PublicRoundSummary, parsePublicLeaderboard } from "./public-results";

const round: PublicRoundSummary = {
  roundId: "round-1",
  tournamentId: "event-1",
  eventName: "Bamboo Tee",
  dayNumber: 1,
  playDate: "2026-11-12",
  version: 2,
  state: "provisional",
  publishedAt: "2026-11-12T10:00:00.000Z",
};

describe("parsePublicLeaderboard", () => {
  it("keeps only the leaderboard fields and preserves the frozen order", () => {
    const board = parsePublicLeaderboard(round, {
      gross: [
        {
          playerId: "p1",
          playerName: "Antonio Alcantara",
          flightName: "Regular A",
          points: 36,
          strokes: 72,
          holesCounted: 18,
          holesTotal: 18,
          contactNumber: "+63 917 000 0000",
          birthdate: "1972-05-04",
        },
        {
          playerId: "p2",
          playerName: "Maria Santos",
          flightName: "Ladies",
          points: 34,
          strokes: 74,
          holesCounted: 17,
          holesTotal: 18,
        },
      ],
      net: [],
    });

    expect(board.round).toEqual(round);
    expect(board.gross).toEqual([
      {
        playerId: "p1",
        playerName: "Antonio Alcantara",
        flightName: "Regular A",
        points: 36,
        strokes: 72,
        holesCounted: 18,
        holesTotal: 18,
        photoPath: null,
      },
      {
        playerId: "p2",
        playerName: "Maria Santos",
        flightName: "Ladies",
        points: 34,
        strokes: 74,
        holesCounted: 17,
        holesTotal: 18,
        photoPath: null,
      },
    ]);
    expect(JSON.stringify(board)).not.toContain("contactNumber");
    expect(JSON.stringify(board)).not.toContain("1972-05-04");
  });

  it("keeps old snapshots readable when they have no player ids", () => {
    const board = parsePublicLeaderboard(round, {
      gross: [{ playerName: "Ramon Aguilar", points: 30, holesCounted: 18, holesTotal: 18 }],
    });
    expect(board.gross[0]).toMatchObject({ playerId: null, playerName: "Ramon Aguilar" });
    expect(board.net).toEqual([]);
  });

  it("drops rows without a name and tolerates a missing snapshot body", () => {
    expect(parsePublicLeaderboard(round, {}).gross).toEqual([]);
    expect(parsePublicLeaderboard(round, { gross: [{ points: 4 }] }).gross).toEqual([]);
  });
});
