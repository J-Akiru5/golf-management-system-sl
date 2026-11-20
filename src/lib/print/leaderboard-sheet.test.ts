import { describe, expect, it } from "vitest";
import {
  buildLeaderboardSheet,
  formatPoints,
  type LeaderboardCell,
  type LeaderboardPair,
  type LeaderboardPlayer,
  orderPairs,
  pairTotal,
  playerTotal,
} from "./leaderboard-sheet";

const cell = (points: number | null, session: "AM" | "PM" | null = null): LeaderboardCell => ({
  points,
  session,
});

function player(
  name: string,
  side: "member" | "guest",
  cells: LeaderboardCell[],
  courseHandicap: number | null = 18,
): LeaderboardPlayer {
  return { playerId: name, name, side, courseHandicap, cells };
}

function pair(
  pairNumber: number,
  memberCells: LeaderboardCell[],
  guestCells: LeaderboardCell[],
): LeaderboardPair {
  return {
    pairNumber,
    className: "Class D",
    member: player("Member", "member", memberCells),
    guest: player("Guest", "guest", guestCells, 22),
  };
}

describe("playerTotal", () => {
  it("adds only the days with a result", () => {
    expect(playerTotal([cell(32, "AM"), cell(null), cell(28, "PM")])).toBe(60);
  });

  it("keeps a zero as a real result", () => {
    expect(playerTotal([cell(0, "AM"), cell(4, "PM")])).toBe(4);
  });

  it("returns null when no day has a result", () => {
    expect(playerTotal([cell(null), cell(null)])).toBeNull();
  });
});

describe("pairTotal", () => {
  it("adds both partners", () => {
    expect(
      pairTotal({
        ...pair(1, [cell(30)], [cell(24)]),
        member: { ...pair(1, [], []).member, total: 30 },
        guest: { ...pair(1, [], []).guest, total: 24 },
      }),
    ).toBe(54);
  });

  it("counts one partner with a result and returns null when neither has one", () => {
    expect(
      pairTotal({
        ...pair(1, [], []),
        member: { ...pair(1, [], []).member, total: 30 },
        guest: { ...pair(1, [], []).guest, total: null },
      }),
    ).toBe(30);
    expect(
      pairTotal({
        ...pair(1, [], []),
        member: { ...pair(1, [], []).member, total: null },
        guest: { ...pair(1, [], []).guest, total: null },
      }),
    ).toBeNull();
  });
});

describe("orderPairs", () => {
  it("puts the highest team total first and the pair with no result last", () => {
    const low = { ...pair(3, [], []), teamTotal: 41 };
    const high = { ...pair(7, [], []), teamTotal: 68 };
    const none = { ...pair(2, [], []), teamTotal: null };
    expect(orderPairs([low, none, high]).map((item) => item.pairNumber)).toEqual([7, 3, 2]);
  });

  it("breaks equal totals by pair number", () => {
    const first = { ...pair(9, [], []), teamTotal: 60 };
    const second = { ...pair(4, [], []), teamTotal: 60 };
    expect(orderPairs([first, second]).map((item) => item.pairNumber)).toEqual([4, 9]);
  });
});

describe("buildLeaderboardSheet", () => {
  it("adds the player and team totals and orders the pairs", () => {
    const sheet = buildLeaderboardSheet({
      eventName: "24th Bamboo Tee",
      asOf: "15 Nov 2026, 10:32 AM",
      days: [
        { dayNumber: 1, label: "Day 1", dateLabel: "Nov 12" },
        { dayNumber: 2, label: "Day 2", dateLabel: "Nov 13" },
      ],
      pairs: [
        pair(2, [cell(30, "AM"), cell(28, "PM")], [cell(20, "AM"), cell(22, "PM")]),
        pair(8, [cell(38, "AM"), cell(35, "AM")], [cell(30, "AM"), cell(31, "AM")]),
      ],
    });
    expect(sheet.pairs.map((item) => item.pairNumber)).toEqual([8, 2]);
    expect(sheet.pairs[0]?.teamTotal).toBe(134);
    expect(sheet.pairs[0]?.member.total).toBe(73);
    expect(sheet.pairs[0]?.guest.total).toBe(61);
    expect(sheet.pairs[0]?.member.courseHandicap).toBe(18);
    expect(sheet.pairs[0]?.guest.courseHandicap).toBe(22);
  });
});

describe("formatPoints", () => {
  it("prints a dash for no result and keeps zero", () => {
    expect(formatPoints(null)).toBe("—");
    expect(formatPoints(0)).toBe("0");
    expect(formatPoints(32)).toBe("32");
  });
});
