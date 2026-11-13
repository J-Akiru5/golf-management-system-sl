import { describe, expect, it } from "vitest";
import type {
  PublicTeamLeaderboardData,
  PublicTeamPlayerRow,
  PublicTeamRound,
} from "@/lib/data/public-team-leaderboard";
import {
  buildPlayerScores,
  buildScoreRows,
  filterPlayerScores,
  hasSessions,
  type PublicPlayerScore,
  rankPlayerScores,
  scoreClasses,
  scoreDays,
} from "./public-scores";

const round = (dayNumber: number, playDate: string): PublicTeamRound => ({
  roundId: `r${dayNumber}`,
  dayNumber,
  playDate,
  state: "final",
  version: 1,
  publishedAt: `${playDate}T18:00:00+08:00`,
});

const row = (
  playerId: string,
  playerName: string,
  rounds: PublicTeamRound[],
  points: { gross: number | null; net: number | null },
  extra: Partial<PublicTeamPlayerRow> = {},
): PublicTeamPlayerRow[] =>
  rounds.map((entry) => ({
    roundId: entry.roundId,
    dayNumber: entry.dayNumber,
    playDate: entry.playDate,
    state: entry.state,
    version: entry.version,
    publishedAt: entry.publishedAt,
    playerId,
    playerName,
    side: "member",
    flightName: "Class A",
    categoryName: "Regular",
    pairNumber: 7,
    pairKey: "pair:7",
    grossStrokes: 82,
    netStrokes: 70,
    grossPoints: points.gross,
    netPoints: points.net,
    holesCounted: 18,
    holesTotal: 18,
    parTotal: 72,
    ...extra,
  }));

const rounds = [round(1, "2026-11-13"), round(2, "2026-11-14")];

const data = (rows: PublicTeamPlayerRow[]): PublicTeamLeaderboardData => ({
  tournamentId: "t1",
  eventName: "Bamboo Tee",
  tieBreak: null,
  rounds,
  rows,
});

const sessions = {
  "p1|2026-11-13": "AM",
  "p1|2026-11-14": "AM",
  "p2|2026-11-13": "AM",
  "p2|2026-11-14": "AM",
  "p3|2026-11-13": "PM",
  "p3|2026-11-14": "PM",
} as const;

const sample = () =>
  buildScoreRows(
    data([
      ...row("p1", "PALIC, CHRYSLER ANNE", rounds, { gross: 30, net: 36 }),
      ...row("p2", "DELA CRUZ, JUAN", rounds, { gross: 34, net: 33 }),
      ...row("p3", "TAN, MARIA", rounds, { gross: 20, net: 26 }),
    ]),
    sessions,
  );

describe("score days", () => {
  it("lists the days that have a published round, in order", () => {
    expect(scoreDays(data([]))).toEqual([
      { dayNumber: 1, playDate: "2026-11-13" },
      { dayNumber: 2, playDate: "2026-11-14" },
    ]);
  });
});

describe("score rows", () => {
  it("keeps one row per player per round and attaches the session", () => {
    const rows = sample();
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      key: "p1|r1",
      dayNumber: 1,
      session: "AM",
      name: "PALIC, CHRYSLER ANNE",
    });
    expect(rows[4]).toMatchObject({ playerId: "p3", session: "PM" });
  });

  it("leaves the session empty when the pairings do not name that player", () => {
    const rows = buildScoreRows(
      data(row("p9", "NO START, PLAYER", [rounds[0]!], { gross: 20, net: 22 })),
      sessions,
    );
    expect(rows[0]?.session).toBeNull();
    expect(hasSessions(rows)).toBe(false);
  });
});

describe("the board", () => {
  it("totals every published round per player and ranks by net points", () => {
    const { scores } = buildPlayerScores(sample());
    expect(scores.map((score) => score.name)).toEqual([
      "PALIC, CHRYSLER ANNE",
      "DELA CRUZ, JUAN",
      "TAN, MARIA",
    ]);
    expect(scores[0]).toMatchObject({
      dayNumber: null,
      rounds: 2,
      netPoints: 72,
      grossPoints: 60,
      holesCounted: 36,
      rank: 1,
    });
  });

  it("keeps each round's own session and points, so the board can print AM and PM", () => {
    const { scores } = buildPlayerScores(sample());
    expect(scores[0]?.roundScores).toEqual([
      {
        dayNumber: 1,
        playDate: "2026-11-13",
        session: "AM",
        grossPoints: 30,
        netPoints: 36,
        holesCounted: 18,
        holesTotal: 18,
      },
      {
        dayNumber: 2,
        playDate: "2026-11-14",
        session: "AM",
        grossPoints: 30,
        netPoints: 36,
        holesCounted: 18,
        holesTotal: 18,
      },
    ]);
  });

  it("marks players who share the same figures as tied, with the same rank", () => {
    const scores: PublicPlayerScore[] = [
      {
        playerId: "a",
        name: "ALPHA, ONE",
        dayNumber: 1,
        playDate: "2026-11-13",
        session: "AM",
        rounds: 1,
        roundScores: [],
        grossPoints: 30,
        netPoints: 34,
        grossStrokes: 80,
        netStrokes: 68,
        holesCounted: 18,
        holesTotal: 18,
        pairNumber: 1,
        flightName: null,
        rank: 0,
        tied: false,
      },
      {
        playerId: "b",
        name: "BRAVO, TWO",
        dayNumber: 1,
        playDate: "2026-11-13",
        session: "AM",
        rounds: 1,
        roundScores: [],
        grossPoints: 30,
        netPoints: 34,
        grossStrokes: 82,
        netStrokes: 70,
        holesCounted: 18,
        holesTotal: 18,
        pairNumber: 2,
        flightName: null,
        rank: 0,
        tied: false,
      },
    ];
    const ranked = rankPlayerScores(scores);
    expect(ranked.map((score) => score.rank)).toEqual([1, 1]);
    expect(ranked.every((score) => score.tied)).toBe(true);
  });

  it("narrows to one day and then to one session", () => {
    const dayOne = buildPlayerScores(sample(), { day: 1 });
    expect(dayOne.scores).toHaveLength(3);
    expect(dayOne.scores[0]).toMatchObject({ dayNumber: 1, rounds: 1, netPoints: 36 });

    const morning = buildPlayerScores(sample(), { day: 1, session: "AM" });
    expect(morning.scores.map((score) => score.playerId)).toEqual(["p1", "p2"]);
    expect(morning.withoutSession).toBe(0);

    const afternoon = buildPlayerScores(sample(), { day: 1, session: "PM" });
    expect(afternoon.scores.map((score) => score.playerId)).toEqual(["p3"]);
  });

  it("counts the players a session filter drops because no start was recorded", () => {
    const rows = sample();
    const withBlank = [
      ...rows,
      ...buildScoreRows(
        data(row("p4", "NO START, PLAYER", [rounds[0]!], { gross: 18, net: 20 })),
        {},
      ),
    ];
    const morning = buildPlayerScores(withBlank, { day: 1, session: "AM" });
    expect(morning.withoutSession).toBe(1);
  });

  it("keeps solo players, who have no pair number", () => {
    const solo = buildScoreRows(
      data(row("p5", "SOLO, PLAYER", [rounds[0]!], { gross: 25, net: 27 }, { pairNumber: null })),
      sessions,
    );
    expect(buildPlayerScores(solo, { day: 1 }).scores[0]?.pairNumber).toBeNull();
  });
});

describe("the name search", () => {
  it("finds a name by any of its words, ignoring order and capitals", () => {
    const { scores } = buildPlayerScores(sample());
    expect(
      filterPlayerScores(scores, { query: "chrysler" }).map((score) => score.playerId),
    ).toEqual(["p1"]);
    expect(
      filterPlayerScores(scores, { query: "anne palic" }).map((score) => score.playerId),
    ).toEqual(["p1"]);
    expect(filterPlayerScores(scores, { query: "  " })).toHaveLength(3);
    expect(filterPlayerScores(scores, { query: "nobody" })).toHaveLength(0);
  });

  it("finds a name typed without its accent", () => {
    const rows = buildScoreRows(
      data(row("p7", "TAÑADA, JOSE LEONARDO", [rounds[0]!], { gross: 20, net: 22 })),
      sessions,
    );
    const { scores } = buildPlayerScores(rows);
    expect(filterPlayerScores(scores, { query: "tanada leonardo" }).map((s) => s.playerId)).toEqual(
      ["p7"],
    );
  });

  it("filters by class", () => {
    const rows = buildScoreRows(
      data([
        ...row("p1", "PALIC, CHRYSLER ANNE", [rounds[0]!], { gross: 30, net: 36 }),
        ...row(
          "p2",
          "DELA CRUZ, JUAN",
          [rounds[0]!],
          { gross: 34, net: 33 },
          { flightName: "Class B" },
        ),
      ]),
      sessions,
    );
    const { scores } = buildPlayerScores(rows, { day: 1 });
    expect(scoreClasses(scores)).toEqual(["Class A", "Class B"]);
    expect(
      filterPlayerScores(scores, { flight: "Class B" }).map((score) => score.playerId),
    ).toEqual(["p2"]);
    expect(filterPlayerScores(scores, { flight: "Class B", query: "palic" })).toHaveLength(0);
  });
});
