import { describe, expect, it } from "vitest";
import type { PortalScorecard, PortalScorecardHole } from "./portal";
import { handicapStrokeLabel, scorecardRows, totalsFor } from "./scorecard";

function hole(number: number, overrides: Partial<PortalScorecardHole> = {}): PortalScorecardHole {
  return {
    hole: number,
    par: 4,
    strokeIndex: number,
    grossStrokes: 5,
    handicapStrokes: 1,
    netStrokes: 4,
    grossPoints: 1,
    netPoints: 2,
    ...overrides,
  };
}

function card(overrides: Partial<PortalScorecard> = {}): PortalScorecard {
  const holes = Array.from({ length: 18 }, (_, index) => hole(index + 1));
  return {
    roundId: "round-1",
    dayNumber: 1,
    playDate: "2026-11-12",
    state: "final",
    version: 3,
    publishedAt: "2026-11-12T10:00:00.000Z",
    playingHandicap: 18,
    courseHandicap: 18,
    grossStrokes: 90,
    netStrokes: 72,
    grossPoints: 18,
    netPoints: 36,
    holesCounted: 18,
    holesTotal: 18,
    holes,
    ...overrides,
  };
}

describe("scorecard rows", () => {
  it("keeps every hole in order and leaves an unpublished hole empty", () => {
    const source = card({ holes: [hole(1), hole(2), hole(4)] });
    const rows = scorecardRows(source);

    expect(rows).toHaveLength(18);
    expect(rows[0]?.hole).toBe(1);
    expect(rows[2]).toBeNull();
    expect(rows[3]?.hole).toBe(4);
  });

  it("uses the hole total from the snapshot, not a hard-coded 18", () => {
    const nine = card({
      holesTotal: 9,
      holes: Array.from({ length: 9 }, (_, index) => hole(index + 1)),
    });
    expect(scorecardRows(nine)).toHaveLength(9);
  });
});

describe("scorecard totals", () => {
  it("sums each nine separately and then the whole card", () => {
    const source = card({
      holes: Array.from({ length: 18 }, (_, index) =>
        hole(index + 1, { grossStrokes: 4, netStrokes: 4, grossPoints: 2, netPoints: 2 }),
      ),
    });

    expect(totalsFor(source, 1, 9)).toEqual({
      holes: 9,
      grossStrokes: 36,
      netStrokes: 36,
      grossPoints: 18,
      netPoints: 18,
    });
    expect(totalsFor(source)).toEqual({
      holes: 18,
      grossStrokes: 72,
      netStrokes: 72,
      grossPoints: 36,
      netPoints: 36,
    });
  });

  it("does not turn a missing net score into zero", () => {
    const source = card({
      holes: [hole(1), hole(2, { netStrokes: null, netPoints: null }), hole(3)],
      holesTotal: 3,
    });

    const totals = totalsFor(source);
    expect(totals.grossStrokes).toBe(15);
    expect(totals.grossPoints).toBe(3);
    expect(totals.netStrokes).toBeNull();
    expect(totals.netPoints).toBeNull();
  });

  it("returns an unknown total for an empty range", () => {
    const source = card({ holes: [hole(1)], holesTotal: 18 });
    expect(totalsFor(source, 10, 18)).toEqual({
      holes: 0,
      grossStrokes: 0,
      netStrokes: null,
      grossPoints: 0,
      netPoints: null,
    });
  });
});

describe("handicap stroke label", () => {
  it("shows received strokes with a plus and given-back strokes with a minus", () => {
    expect(handicapStrokeLabel(2)).toBe("+2");
    expect(handicapStrokeLabel(-1)).toBe("-1");
    expect(handicapStrokeLabel(0)).toBe("-");
    expect(handicapStrokeLabel(null)).toBe("-");
  });
});
