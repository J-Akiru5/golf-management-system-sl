import { describe, expect, it } from "vitest";
import type {
  PublicTeamLeaderboardData,
  PublicTeamPlayerRow,
} from "@/lib/data/public-team-leaderboard";
import type { ScoreSession } from "./public-scores";
import { buildTvBoard, manilaDateIso, pickTvDay } from "./tv-board";

const PUBLISHED_AT = "2026-11-14T10:00:00Z";

function round(dayNumber: number, playDate: string) {
  return {
    roundId: `round-${dayNumber}`,
    dayNumber,
    playDate,
    state: "final" as const,
    version: 1,
    publishedAt: PUBLISHED_AT,
  };
}

function player(
  day: ReturnType<typeof round>,
  playerId: string,
  playerName: string,
  pairNumber: number | null,
  grossPoints: number | null,
  netPoints: number | null,
): PublicTeamPlayerRow {
  return {
    roundId: day.roundId,
    dayNumber: day.dayNumber,
    playDate: day.playDate,
    state: day.state,
    version: day.version,
    publishedAt: day.publishedAt,
    playerId,
    playerName,
    side: "member",
    flightName: "Class A",
    categoryName: "Championship",
    pairNumber,
    pairKey: pairNumber === null ? `solo:${playerId}` : `pair:${pairNumber}`,
    grossStrokes: 84,
    netStrokes: 70,
    grossPoints,
    netPoints,
    holesCounted: 18,
    holesTotal: 18,
    parTotal: 72,
  };
}

const day1 = round(1, "2026-11-13");
const day2 = round(2, "2026-11-14");

function data(rows: PublicTeamPlayerRow[]): PublicTeamLeaderboardData {
  return {
    tournamentId: "bamboo-tee-2026",
    eventName: "The 24th Bamboo Tee",
    tieBreak: null,
    rounds: [day1, day2],
    rows,
  };
}

describe("manilaDateIso", () => {
  it("returns the Philippine calendar day, not the server's", () => {
    // 20:00 UTC on the 13th is 04:00 on the 14th in Manila.
    expect(manilaDateIso(new Date("2026-11-13T20:00:00Z"))).toBe("2026-11-14");
    expect(manilaDateIso(new Date("2026-11-14T02:00:00Z"))).toBe("2026-11-14");
  });
});

describe("pickTvDay", () => {
  it("shows today when a round for today is published", () => {
    expect(pickTvDay([day1, day2], "2026-11-14")).toEqual({
      day: { dayNumber: 2, playDate: "2026-11-14" },
      isToday: true,
    });
  });

  it("falls back to the most recent published day and says it is not today", () => {
    expect(pickTvDay([day1, day2], "2026-11-16")).toEqual({
      day: { dayNumber: 2, playDate: "2026-11-14" },
      isToday: false,
    });
  });

  it("uses the first published day before the event reaches it", () => {
    expect(pickTvDay([day1, day2], "2026-11-01")).toEqual({
      day: { dayNumber: 1, playDate: "2026-11-13" },
      isToday: false,
    });
  });

  it("returns no day when nothing is published", () => {
    expect(pickTvDay([], "2026-11-14")).toEqual({ day: null, isToday: false });
  });
});

describe("buildTvBoard", () => {
  it("splits the day into morning and afternoon columns, ranked by net then gross", () => {
    const rows = [
      player(day2, "a", "ALPHA, ANA", 1, 30, 34),
      player(day2, "b", "BRAVO, BEN", 2, 40, 32),
      player(day2, "c", "CHARLIE, CEL", 3, 28, 36),
      player(day2, "d", "DELTA, DAN", 4, 30, 34),
    ];
    const sessions: Record<string, ScoreSession> = {
      "a|2026-11-14": "AM",
      "b|2026-11-14": "PM",
      "c|2026-11-14": "AM",
      "d|2026-11-14": "PM",
    };

    const board = buildTvBoard(data(rows), sessions, "2026-11-14");

    expect(board.day).toEqual({ dayNumber: 2, playDate: "2026-11-14" });
    expect(board.columns).toHaveLength(2);
    expect(board.columns.map((column) => column.session)).toEqual(["AM", "PM"]);
    expect(board.columns[0]?.players.map((line) => line.playerId)).toEqual(["c", "a"]);
    expect(board.columns[0]?.players[0]).toMatchObject({ rank: 1, netPoints: 36, grossPoints: 28 });
    expect(board.columns[1]?.players.map((line) => line.playerId)).toEqual(["d", "b"]);
    expect(board.unplaced).toBe(0);
  });

  it("marks both sides of a tie and keeps them at the same rank", () => {
    const rows = [
      player(day2, "a", "ALPHA, ANA", 1, 30, 34),
      player(day2, "b", "BRAVO, BEN", 2, 30, 34),
    ];
    const sessions: Record<string, ScoreSession> = {
      "a|2026-11-14": "AM",
      "b|2026-11-14": "AM",
    };

    const board = buildTvBoard(data(rows), sessions, "2026-11-14");

    expect(board.columns[0]?.players.map((line) => [line.rank, line.tied])).toEqual([
      [1, true],
      [1, true],
    ]);
  });

  it("adds the two partners together for the pair view", () => {
    const rows = [
      player(day2, "a", "ALPHA, ANA", 7, 30, 34),
      player(day2, "b", "BRAVO, BEN", 7, 26, 30),
      player(day2, "c", "CHARLIE, CEL", 9, 40, 20),
      player(day2, "d", "DELTA, DAN", 9, 24, 22),
    ];
    const sessions: Record<string, ScoreSession> = {
      "a|2026-11-14": "AM",
      "b|2026-11-14": "AM",
      "c|2026-11-14": "AM",
      "d|2026-11-14": "AM",
    };

    const pairs = buildTvBoard(data(rows), sessions, "2026-11-14").columns[0]?.pairs ?? [];

    expect(pairs.map((line) => [line.pairNumber, line.grossPoints, line.netPoints])).toEqual([
      [7, 56, 64],
      [9, 64, 42],
    ]);
    expect(pairs[0]?.names).toEqual(["ALPHA, ANA", "BRAVO, BEN"]);
  });

  it("counts the players whose start is not in the published pairings", () => {
    const rows = [
      player(day2, "a", "ALPHA, ANA", 1, 30, 34),
      player(day2, "b", "BRAVO, BEN", 2, 31, 35),
    ];
    const sessions: Record<string, ScoreSession> = { "a|2026-11-14": "AM" };

    expect(buildTvBoard(data(rows), sessions, "2026-11-14").unplaced).toBe(1);
  });

  it("shows the whole day as one column when no starts are published", () => {
    const rows = [
      player(day2, "a", "ALPHA, ANA", 1, 30, 34),
      player(day2, "b", "BRAVO, BEN", 2, 31, 35),
    ];

    const board = buildTvBoard(data(rows), {}, "2026-11-14");

    expect(board.columns).toHaveLength(1);
    expect(board.columns[0]?.session).toBeNull();
    expect(board.columns[0]?.players).toHaveLength(2);
    expect(board.unplaced).toBe(0);
  });

  it("shows each player's own line to somebody with no published pair", () => {
    const rows = [player(day2, "a", "ALPHA, ANA", null, 30, 34)];

    const board = buildTvBoard(data(rows), {}, "2026-11-14");

    expect(board.columns[0]?.pairs).toEqual([
      {
        key: "player:a",
        pairNumber: null,
        names: ["ALPHA, ANA"],
        grossPoints: 30,
        netPoints: 34,
        teeTime: null,
        teeHole: null,
        rank: 1,
        tied: false,
      },
    ]);
  });

  it("has no columns when nothing is published", () => {
    const board = buildTvBoard(data([]), {}, "2026-11-14");

    expect(board.columns).toEqual([]);
    expect(board.day).toEqual({ dayNumber: 2, playDate: "2026-11-14" });
  });

  it("puts the published tee time on the player's line and the earliest one on the pair", () => {
    const rows = [
      player(day2, "a", "ALPHA, ANA", 7, 30, 34),
      player(day2, "b", "BRAVO, BEN", 7, 26, 30),
    ];
    const sessions: Record<string, ScoreSession> = {
      "a|2026-11-14": "AM",
      "b|2026-11-14": "AM",
    };
    const starts = {
      "a|2026-11-14": { time: "07:10", hole: 4 },
      "b|2026-11-14": { time: "06:40", hole: 4 },
    };

    const column = buildTvBoard(data(rows), sessions, "2026-11-14", starts).columns[0];

    expect(column?.players.find((line) => line.playerId === "a")).toMatchObject({
      teeTime: "07:10",
      teeHole: 4,
    });
    expect(column?.pairs[0]).toMatchObject({ teeTime: "06:40", teeHole: 4 });
  });

  it("leaves the tee line empty when the pairings are held", () => {
    const rows = [player(day2, "a", "ALPHA, ANA", 1, 30, 34)];
    const sessions: Record<string, ScoreSession> = { "a|2026-11-14": "AM" };

    const column = buildTvBoard(data(rows), sessions, "2026-11-14").columns[0];

    expect(column?.players[0]).toMatchObject({ teeTime: null, teeHole: null });
  });
});

describe("the all-days view", () => {
  const sessions: Record<string, ScoreSession> = {
    "a|2026-11-13": "AM",
    "a|2026-11-14": "PM",
    "b|2026-11-14": "AM",
  };
  const rows = [
    player(day1, "a", "ALPHA, ANA", 1, 30, 34),
    player(day2, "a", "ALPHA, ANA", 1, 36, 30),
    player(day2, "b", "BRAVO, BEN", 2, 31, 40),
  ];
  const board = buildTvBoard(data(rows), sessions, "2026-11-14");

  it("adds every published round per player and ranks on the total", () => {
    expect(board.overall.map((line) => [line.playerId, line.grossPoints, line.netPoints])).toEqual([
      ["a", 66, 64],
      ["b", 31, 40],
    ]);
    expect(board.days).toBe(2);
  });

  it("keeps each round with its day and its half, in day order", () => {
    const line = board.overall.find((entry) => entry.playerId === "a");
    expect(line?.rounds.map((round) => [round.dayNumber, round.session, round.netPoints])).toEqual([
      [1, "AM", 34],
      [2, "PM", 30],
    ]);
  });

  it("does not invent a round for a day a player did not play", () => {
    expect(board.overall.find((entry) => entry.playerId === "b")?.rounds).toHaveLength(1);
  });

  it("is empty before anything is published", () => {
    const empty = buildTvBoard(data([]), {}, "2026-11-14");
    expect(empty.overall).toEqual([]);
    expect(empty.days).toBe(0);
  });
});
