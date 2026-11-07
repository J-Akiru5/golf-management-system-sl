import { describe, expect, it } from "vitest";
import type { DrawGroup } from "./validate";
import { placementOf, removePlayerFromDraw, restorePlayerToDraw } from "./withdraw";

const group = (number: number, playerIds: string[]): DrawGroup => ({
  number,
  time: "06:30",
  startHole: number,
  wave: null,
  flightId: "class-a",
  playerIds,
  locked: false,
});

const board = (): DrawGroup[] => [group(1, ["p1", "p2", "p3"]), group(2, ["p4"]), group(3, [])];

describe("withdrawing from the draw", () => {
  it("finds the group and the slot the player held", () => {
    expect(placementOf(board(), "p2")).toEqual({ groupNumber: 1, index: 1 });
    expect(placementOf(board(), "p9")).toBeNull();
  });

  it("removes only that player and keeps the group", () => {
    const after = removePlayerFromDraw(board(), "p2");
    expect(after.map((g) => g.number)).toEqual([1, 2, 3]);
    expect(after[0]?.playerIds).toEqual(["p1", "p3"]);
    expect(after[1]?.playerIds).toEqual(["p4"]);
  });

  it("leaves the board untouched for a player who is not on it", () => {
    const before = board();
    expect(removePlayerFromDraw(before, "p9")).toBe(before);
  });

  it("restores the player to the same slot", () => {
    const placement = placementOf(board(), "p2");
    expect(placement).not.toBeNull();
    const back = restorePlayerToDraw(
      removePlayerFromDraw(board(), "p2"),
      "p2",
      placement ?? {
        groupNumber: 1,
        index: 1,
      },
    );
    expect(back[0]?.playerIds).toEqual(["p1", "p2", "p3"]);
  });

  it("does not add the player twice", () => {
    const before = board();
    expect(restorePlayerToDraw(before, "p2", { groupNumber: 1, index: 1 })).toBe(before);
  });

  it("does not invent a place when the group has gone", () => {
    const before = board();
    expect(restorePlayerToDraw(before, "p9", { groupNumber: 99, index: 0 })).toBe(before);
  });

  it("keeps a group that lost its last player, so the rest are not renumbered", () => {
    const after = removePlayerFromDraw(board(), "p4");
    expect(after.map((g) => g.number)).toEqual([1, 2, 3]);
    expect(after[1]?.playerIds).toEqual([]);
  });
});
