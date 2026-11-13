import { describe, expect, it } from "vitest";
import { moveSet, swapPlayers, swapSets } from "./player-moves";
import type { DrawGroup } from "./validate";

const g = (number: number, playerIds: string[], over: Partial<DrawGroup> = {}): DrawGroup => ({
  number,
  flightId: "a",
  playerIds,
  startHole: number,
  wave: null,
  time: "06:30",
  locked: false,
  ...over,
});

const okDraw = (result: ReturnType<typeof swapPlayers>) => {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.draw;
};
const find = (draw: DrawGroup[], number: number) => draw.find((x) => x.number === number);
const playersOf = (draw: DrawGroup[], number: number) => find(draw, number)?.playerIds;

// Two full groups, the case a plain move refuses.
const full = [g(1, ["p1", "p2", "p3", "p4"]), g(2, ["p5", "p6", "p7", "p8"]), g(3, ["p9", "p10"])];

describe("swapPlayers", () => {
  it("swaps two players between full groups, keeping each row's place, and locks both", () => {
    const result = swapPlayers(full, "p2", "p6");
    const next = okDraw(result);
    expect(playersOf(next, 1)).toEqual(["p1", "p6", "p3", "p4"]);
    expect(playersOf(next, 2)).toEqual(["p5", "p2", "p7", "p8"]);
    expect(find(next, 1)?.locked).toBe(true);
    expect(find(next, 2)?.locked).toBe(true);
    expect(find(next, 3)?.locked).toBe(false);
    expect(result.ok && result.note).toBe("Swapped one player between group 1 and group 2.");
  });

  it("works when one group has only one player and the other is full", () => {
    const next = okDraw(swapPlayers(full, "p9", "p1"));
    expect(playersOf(next, 3)).toEqual(["p1", "p10"]);
    expect(playersOf(next, 1)).toEqual(["p9", "p2", "p3", "p4"]);
  });

  it("refuses two players who are already in one group: nothing would change", () => {
    expect(swapPlayers(full, "p1", "p3")).toEqual({
      ok: false,
      reason: "Both players are in group 1, so there is nothing to swap.",
    });
  });

  it("refuses the same player twice and an unknown player", () => {
    expect(swapPlayers(full, "p1", "p1")).toEqual({
      ok: false,
      reason: "Pick two different players.",
    });
    expect(swapPlayers(full, "p1", "nobody")).toEqual({
      ok: false,
      reason: "One of those players is not on the board.",
    });
    expect(swapPlayers(full, "nobody", "p1")).toEqual({
      ok: false,
      reason: "One of those players is not on the board.",
    });
  });

  it("does not change the draw it was given", () => {
    const copy = JSON.parse(JSON.stringify(full));
    swapPlayers(full, "p1", "p5");
    expect(full).toEqual(copy);
  });
});

describe("moveSet", () => {
  it("moves a pair into a group with room and locks every group it left", () => {
    const result = moveSet(full, ["p3", "p4"], 3, 4);
    const next = okDraw(result);
    expect(playersOf(next, 3)).toEqual(["p9", "p10", "p3", "p4"]);
    expect(playersOf(next, 1)).toEqual(["p1", "p2"]);
    expect(find(next, 1)?.locked).toBe(true);
    expect(find(next, 3)?.locked).toBe(true);
    expect(find(next, 2)?.locked).toBe(false);
    expect(result.ok && result.note).toBe("Moved 2 players to group 3.");
  });

  it("changes nothing and locks nothing when everyone is already in the group", () => {
    const result = moveSet(full, ["p9", "p10"], 3, 4);
    const next = okDraw(result);
    expect(playersOf(next, 3)).toEqual(["p9", "p10"]);
    expect(find(next, 3)?.locked).toBe(false);
    expect(result.ok && result.note).toBe("Group 3 already holds them.");
  });

  it("refuses a set that would take the group over the size setting", () => {
    expect(moveSet(full, ["p3", "p4"], 2, 4)).toEqual({
      ok: false,
      reason: "Group 2 would hold 6 players and the limit is 4.",
    });
    // Room for exactly one more, so a set of two will not fit.
    expect(moveSet(full, ["p9", "p10"], 2, 5)).toEqual({
      ok: false,
      reason: "Group 2 would hold 6 players and the limit is 5.",
    });
    // A bigger setting lets the same set through: the number is never assumed to be four.
    expect(moveSet(full, ["p9", "p10"], 2, 6).ok).toBe(true);
  });

  it("counts a player already in the target group once", () => {
    const next = okDraw(moveSet(full, ["p1", "p9"], 1, 5));
    expect(playersOf(next, 1)).toEqual(["p1", "p2", "p3", "p4", "p9"]);
    expect(playersOf(next, 3)).toEqual(["p10"]);
    expect(find(next, 3)?.locked).toBe(true);
  });

  it("refuses an empty set, an unknown group and an unknown player", () => {
    expect(moveSet(full, [], 1, 4)).toEqual({ ok: false, reason: "Pick at least one player." });
    expect(moveSet(full, ["p1"], 9, 4)).toEqual({
      ok: false,
      reason: "Group 9 is not in the draw.",
    });
    expect(moveSet(full, ["p1", "nobody"], 3, 4)).toEqual({
      ok: false,
      reason: "One of those players is not on the board.",
    });
  });

  it("does not change the draw it was given", () => {
    const copy = JSON.parse(JSON.stringify(full));
    moveSet(full, ["p1", "p2"], 3, 4);
    expect(full).toEqual(copy);
  });
});

describe("swapSets", () => {
  it("exchanges a pair for a pair between full groups and locks all four groups", () => {
    const draw = [g(1, ["a1", "a2", "x1", "x2"]), g(2, ["b1", "b2", "y1", "y2"]), g(3, ["c1"])];
    const result = swapSets(draw, ["a1", "a2"], ["b1", "b2"]);
    const next = okDraw(result);
    expect(playersOf(next, 1)).toEqual(["b1", "b2", "x1", "x2"]);
    expect(playersOf(next, 2)).toEqual(["a1", "a2", "y1", "y2"]);
    expect(find(next, 1)?.locked).toBe(true);
    expect(find(next, 2)?.locked).toBe(true);
    expect(find(next, 3)?.locked).toBe(false);
    expect(result.ok && result.note).toBe("Swapped 2 players between groups 1 and 2.");
  });

  it("keeps every group the same size, so two full groups can trade a pair", () => {
    const draw = [g(1, ["a1", "a2", "a3", "a4"]), g(2, ["b1", "b2", "b3", "b4"])];
    const next = okDraw(swapSets(draw, ["a1", "a2"], ["b3", "b4"]));
    expect(playersOf(next, 1)).toHaveLength(4);
    expect(playersOf(next, 2)).toHaveLength(4);
    expect(playersOf(next, 1)).toEqual(["b3", "b4", "a3", "a4"]);
    expect(playersOf(next, 2)).toEqual(["b1", "b2", "a1", "a2"]);
  });

  it("handles a trade that runs both ways between the same two groups", () => {
    const draw = [g(1, ["a1", "b2"]), g(2, ["a2", "b1"])];
    const next = okDraw(swapSets(draw, ["a1", "a2"], ["b1", "b2"]));
    expect(playersOf(next, 1)).toEqual(["b1", "a2"]);
    expect(playersOf(next, 2)).toEqual(["b2", "a1"]);
  });

  it("locks every group involved when the set spans three groups", () => {
    const draw = [g(1, ["a1"]), g(2, ["a2"]), g(3, ["b1", "b2"]), g(4, ["b3"])];
    const next = okDraw(swapSets(draw, ["a1", "a2"], ["b1", "b2"]));
    expect(playersOf(next, 3)).toEqual(["a1", "a2"]);
    expect(playersOf(next, 1)).toEqual(["b1"]);
    expect(playersOf(next, 2)).toEqual(["b2"]);
    expect(find(next, 4)?.locked).toBe(false);
    expect([1, 2, 3].map((n) => find(next, n)?.locked)).toEqual([true, true, true]);
  });

  it("refuses sets of different sizes", () => {
    expect(swapSets(full, ["p1", "p2"], ["p5"])).toEqual({
      ok: false,
      reason: "Both sides must hold the same number of players (2 and 1).",
    });
    expect(swapSets(full, [], ["p5"])).toEqual({
      ok: false,
      reason: "Pick at least one player on each side.",
    });
  });

  it("refuses a duplicate, an overlap and an unknown player", () => {
    expect(swapSets(full, ["p1", "p1"], ["p5", "p6"])).toEqual({
      ok: false,
      reason: "A player is listed twice.",
    });
    expect(swapSets(full, ["p1", "p5"], ["p5", "p6"])).toEqual({
      ok: false,
      reason: "A player cannot be on both sides.",
    });
    expect(swapSets(full, ["p1", "p2"], ["p5", "nobody"])).toEqual({
      ok: false,
      reason: "One of those players is not on the board.",
    });
  });

  it("refuses a pair that sits in one group already", () => {
    expect(swapSets(full, ["p1", "p2"], ["p3", "p5"])).toEqual({
      ok: false,
      reason: "A swap needs two different groups; group 1 holds both.",
    });
  });

  it("does not change the draw it was given", () => {
    const copy = JSON.parse(JSON.stringify(full));
    swapSets(full, ["p1", "p2"], ["p5", "p6"]);
    expect(full).toEqual(copy);
  });
});
