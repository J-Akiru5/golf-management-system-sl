import { describe, expect, it } from "vitest";
import { POSITION_MIN_GAP, POSITION_STEP } from "@/lib/db/constants";
import {
  applyMove,
  computePosition,
  needsRebalance,
  type PositionedCard,
  rebalance,
  sortColumn,
} from "./order";

type Card = PositionedCard & { title: string };

function card(id: string, stage: string, position: number): Card {
  return { id, stage, position, title: `Card ${id}` };
}

/** A column of three cards 1000 apart. */
function column(): Card[] {
  return [card("a", "live", 1000), card("b", "live", 2000), card("c", "live", 3000)];
}

describe("computePosition", () => {
  it("starts an empty column one step up", () => {
    expect(computePosition(null, null)).toBe(POSITION_STEP);
  });

  it("steps before the first card", () => {
    expect(computePosition(null, 2000)).toBe(2000 - POSITION_STEP);
  });

  it("steps after the last card", () => {
    expect(computePosition(2000, null)).toBe(2000 + POSITION_STEP);
  });

  it("takes the midpoint of two neighbours", () => {
    expect(computePosition(1000, 2000)).toBe(1500);
  });
});

describe("needsRebalance", () => {
  it("is false at the edges", () => {
    expect(needsRebalance(null, 1000)).toBe(false);
    expect(needsRebalance(1000, null)).toBe(false);
    expect(needsRebalance(null, null)).toBe(false);
  });

  it("is true when the gap is below the minimum", () => {
    expect(needsRebalance(1000, 1000 + POSITION_MIN_GAP / 2)).toBe(true);
  });

  it("is false when the gap is comfortable", () => {
    expect(needsRebalance(1000, 2000)).toBe(false);
  });
});

describe("rebalance", () => {
  it("renumbers a column one step apart in position order", () => {
    const renumbered = rebalance([
      card("c", "live", 3000),
      card("a", "live", 1000),
      card("b", "live", 2000),
    ]);
    expect(renumbered.map((entry) => [entry.id, entry.position])).toEqual([
      ["a", POSITION_STEP],
      ["b", POSITION_STEP * 2],
      ["c", POSITION_STEP * 3],
    ]);
  });

  it("breaks a position tie by id so the result is stable", () => {
    const renumbered = rebalance([card("b", "live", 5), card("a", "live", 5)]);
    expect(renumbered.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("sortColumn", () => {
  it("does not mutate the input", () => {
    const input = [card("b", "live", 2), card("a", "live", 1)];
    sortColumn(input);
    expect(input.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("applyMove", () => {
  it("moves within a column using the midpoint", () => {
    const result = applyMove(column(), {
      id: "c",
      toStage: "live",
      beforeId: "a",
      afterId: "b",
    });
    expect(result.position).toBe(1500);
    expect(result.updates).toEqual([{ id: "c", position: 1500 }]);
    const moved = result.cards.find((entry) => entry.id === "c");
    expect(moved?.position).toBe(1500);
    expect(
      sortColumn(result.cards.filter((entry) => entry.stage === "live")).map((e) => e.id),
    ).toEqual(["a", "c", "b"]);
  });

  it("moves to the top of another column", () => {
    const cards = [...column(), card("x", "inquiry", 1000)];
    const result = applyMove(cards, {
      id: "x",
      toStage: "live",
      beforeId: null,
      afterId: "a",
    });
    expect(result.position).toBe(0);
    expect(result.cards.find((entry) => entry.id === "x")?.stage).toBe("live");
  });

  it("moves to the bottom of another column", () => {
    const cards = [...column(), card("x", "inquiry", 1000)];
    const result = applyMove(cards, {
      id: "x",
      toStage: "live",
      beforeId: "c",
      afterId: null,
    });
    expect(result.position).toBe(4000);
  });

  it("moves to an empty column at the starting position", () => {
    const cards = [...column(), card("x", "inquiry", 1000)];
    const result = applyMove(cards, {
      id: "x",
      toStage: "prep",
      beforeId: null,
      afterId: null,
    });
    expect(result.position).toBe(POSITION_STEP);
    expect(result.cards.find((entry) => entry.id === "x")?.stage).toBe("prep");
  });

  it("appends when the neighbour ids are not in the target column", () => {
    const result = applyMove([...column(), card("x", "inquiry", 1000)], {
      id: "x",
      toStage: "live",
      beforeId: "missing",
      afterId: "missing",
    });
    expect(result.position).toBe(4000);
  });

  it("treats a move onto itself as a no-op", () => {
    const result = applyMove(column(), {
      id: "b",
      toStage: "live",
      beforeId: "a",
      afterId: "b",
    });
    expect(result.updates).toEqual([]);
    expect(result.position).toBe(2000);
    expect(result.cards).toHaveLength(3);
  });

  it("rebalances when the neighbours are too close", () => {
    const tight: Card[] = [
      card("a", "live", 1000),
      card("b", "live", 1000 + POSITION_MIN_GAP / 2),
      card("x", "inquiry", 1000),
    ];
    const result = applyMove(tight, {
      id: "x",
      toStage: "live",
      beforeId: "a",
      afterId: "b",
    });
    // All three cards in the target column are renumbered, and nothing else is.
    expect(result.updates).toHaveLength(3);
    const byId = new Map(result.updates.map((update) => [update.id, update.position]));
    expect(byId.get("a")).toBe(POSITION_STEP);
    expect(byId.get("x")).toBe(POSITION_STEP * 2);
    expect(byId.get("b")).toBe(POSITION_STEP * 3);
    expect(result.position).toBe(POSITION_STEP * 2);
  });

  it("rebalances when the midpoint would sit closer than the minimum gap", () => {
    const tight: Card[] = [
      card("a", "live", 1000),
      card("b", "live", 1000 + POSITION_MIN_GAP * 1.5),
      card("x", "inquiry", 1000),
    ];
    const result = applyMove(tight, {
      id: "x",
      toStage: "live",
      beforeId: "a",
      afterId: "b",
    });
    expect(result.updates).toHaveLength(3);
  });

  it("throws when the card is not on the board", () => {
    expect(() =>
      applyMove(column(), { id: "nope", toStage: "live", beforeId: null, afterId: null }),
    ).toThrow(/not on the board/);
  });

  it("does not mutate the input list or its cards", () => {
    const cards = column();
    const result = applyMove(cards, {
      id: "c",
      toStage: "live",
      beforeId: null,
      afterId: "a",
    });
    expect(cards.map((entry) => entry.position)).toEqual([1000, 2000, 3000]);
    expect(result.cards).not.toBe(cards);
  });
});
