import { describe, expect, it } from "vitest";
import { boardKey, findYou, type LiveBoardRow, rankMoves } from "./ranks";

const row = (playerName: string, playerId: string | null = playerName): LiveBoardRow => ({
  playerId,
  playerName,
  flightName: null,
  points: 0,
  strokes: null,
  holesCounted: 0,
  holesTotal: 18,
  photoPath: null,
});

const names = (rows: readonly LiveBoardRow[]) => rows.map((item) => item.playerName);

describe("rankMoves", () => {
  it("reports both sides of a swap, with up being positive", () => {
    const before = [row("ANA"), row("BEN")];
    const after = [row("BEN"), row("ANA")];
    expect(rankMoves(before, after)).toEqual([
      { key: "BEN", from: 2, to: 1, delta: 1 },
      { key: "ANA", from: 1, to: 2, delta: -1 },
    ]);
  });

  it("says nothing about a player who held their place", () => {
    expect(rankMoves([row("ANA"), row("BEN")], [row("ANA"), row("BEN")])).toEqual([]);
  });

  it("does not invent a move for a player who was not on the last board", () => {
    expect(rankMoves([row("ANA")], [row("ANA"), row("CY")])).toEqual([]);
  });
});

describe("boardKey", () => {
  it("uses the id when there is one and the name when the snapshot predates ids", () => {
    expect(boardKey(row("ANA", "p-1"))).toBe("p-1");
    expect(boardKey(row("Ana Cruz", null))).toBe("name:ana cruz");
  });
});

describe("findYou", () => {
  it("matches on the id even when another player shares the name", () => {
    const rows = [row("ANA CRUZ", "p-1"), row("ANA CRUZ", "p-2")];
    expect(findYou(rows, { playerId: "p-2", name: "ANA CRUZ" })?.rank).toBe(2);
  });

  it("falls back to the name when the snapshot has no ids", () => {
    const rows = [row("BEN", null), row("ANA", null)];
    expect(findYou(rows, { playerId: null, name: "ana" })?.rank).toBe(2);
    expect(findYou(rows, { playerId: null, name: "ana" })?.row.playerName).toBe("ANA");
  });

  it("answers nothing when the player is not on the board", () => {
    expect(findYou([row("BEN")], { playerId: "p-9", name: "ANA" })).toBeNull();
    expect(names([row("BEN")])).toEqual(["BEN"]);
  });
});
