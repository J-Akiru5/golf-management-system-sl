import { describe, expect, it } from "vitest";
import type { HoleDefinition } from "@/lib/scoring";
import {
  blankScores,
  cardProgress,
  cardState,
  clampStrokes,
  filledCount,
  MAX_STROKES,
  MIN_STROKES,
  markerFor,
  nextBlankHole,
  reviewRows,
  stateLabel,
} from "./score";

const holes: HoleDefinition[] = [
  { number: 1, par: 4, strokeIndex: 7 },
  { number: 2, par: 5, strokeIndex: 1 },
  { number: 3, par: 3, strokeIndex: 15 },
];

describe("staff score sheet", () => {
  it("keeps a tap inside one and twenty strokes", () => {
    expect(clampStrokes(0)).toBe(MIN_STROKES);
    expect(clampStrokes(-4)).toBe(MIN_STROKES);
    expect(clampStrokes(21)).toBe(MAX_STROKES);
    expect(clampStrokes(4.4)).toBe(4);
  });

  it("starts every hole blank, never at par", () => {
    const scores = blankScores(holes);
    expect(scores).toEqual({ 1: null, 2: null, 3: null });
    expect(filledCount(holes, scores)).toBe(0);
    expect(cardProgress(holes, scores).total).toBe(0);
  });

  it("counts what is filled and against par", () => {
    const scores = { ...blankScores(holes), 1: 5, 2: 4 };
    expect(filledCount(holes, scores)).toBe(2);
    expect(cardProgress(holes, scores)).toEqual({ filled: 2, total: 9, par: 9, toPar: 0 });
  });

  it("finds the next hole still blank and wraps to the start", () => {
    const scores = { ...blankScores(holes), 2: 5 };
    expect(nextBlankHole(holes, scores, 2)).toBe(3);
    expect(nextBlankHole(holes, { ...scores, 3: 3 }, 3)).toBe(1);
    expect(nextBlankHole(holes, { ...blankScores(holes), 1: 4, 2: 5, 3: 3 }, 1)).toBeNull();
  });

  it("names the card's state, and never edits a submitted card", () => {
    expect(cardState(holes, blankScores(holes), false)).toBe("none");
    expect(cardState(holes, { 1: 4, 2: null, 3: null }, false)).toBe("started");
    expect(cardState(holes, { 1: 4, 2: 5, 3: 3 }, false)).toBe("ready");
    expect(cardState(holes, { 1: 4, 2: 5, 3: 3 }, true)).toBe("in");
    expect(stateLabel("in")).toBe("In");
  });

  it("tells the review step which cards are incomplete, in plain words", () => {
    const review = reviewRows(
      holes,
      [
        { playerId: "p1", playerName: "ALPHA" },
        { playerId: "p2", playerName: "BRAVO" },
      ],
      {
        p1: { 1: 4, 2: 5, 3: 3 },
        p2: { 1: 5, 2: null, 3: null },
      },
    );
    expect(review[0]).toMatchObject({ complete: true, total: 12, toPar: 0, errors: [] });
    expect(review[1]?.complete).toBe(false);
    expect(review[1]?.errors).toEqual(["2 holes still blank."]);
  });

  it("says a card has no scores rather than showing a zero total", () => {
    const [row] = reviewRows(holes, [{ playerId: "p1", playerName: "ALPHA" }], {});
    expect(row?.errors).toEqual(["No scores yet."]);
    expect(row?.filled).toBe(0);
  });

  it("rotates markers so nobody marks their own card", () => {
    const players = [{ playerId: "p1" }, { playerId: "p2" }, { playerId: "p3" }];
    expect(markerFor(players, "p1")).toBe("p2");
    expect(markerFor(players, "p3")).toBe("p1");
    expect(markerFor([{ playerId: "p1" }], "p1")).toBeNull();
  });
});
