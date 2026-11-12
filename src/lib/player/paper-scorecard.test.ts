import { describe, expect, it } from "vitest";
import {
  paperFooter,
  paperNines,
  paperNineTotals,
  paperParTotal,
  paperPointsText,
  paperScoreText,
} from "./paper-scorecard";
import type { PortalScorecard, PortalScorecardHole } from "./portal";

/** A par-4 hole with a bogey, one shot received and two net points. */
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
    dayNumber: 2,
    playDate: "2026-11-13",
    state: "final",
    version: 1,
    publishedAt: "2026-11-13T10:00:00.000Z",
    playingHandicap: 18,
    courseHandicap: 20,
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

describe("paper scorecard nines", () => {
  it("draws OUT and IN for a full card, with subtotals per nine", () => {
    const source = card();
    const nines = paperNines(source);

    expect(nines.map((nine) => nine.label)).toEqual(["OUT", "IN"]);
    expect(nines.map((nine) => nine.from)).toEqual([1, 10]);
    expect(nines[0]?.holes).toHaveLength(9);
    expect(nines[1]?.holes).toHaveLength(9);
    expect(nines[0]?.holes[0]?.hole).toBe(1);
    expect(nines[1]?.holes[8]?.hole).toBe(18);

    expect(nines[0]?.totals).toMatchObject({
      par: 36,
      played: 9,
      strokes: 45,
      netPoints: 18,
      grossPoints: 9,
    });
    expect(nines[1]?.totals).toMatchObject({
      par: 36,
      played: 9,
      strokes: 45,
      netPoints: 18,
      grossPoints: 9,
    });
    expect(paperParTotal(source)).toBe(72);
  });

  it("draws one table for a nine-hole card", () => {
    const nine = card({
      holesTotal: 9,
      holesCounted: 9,
      holes: Array.from({ length: 9 }, (_, index) => hole(index + 1)),
    });
    const nines = paperNines(nine);

    expect(nines).toHaveLength(1);
    expect(nines[0]?.label).toBe("OUT");
    expect(nines[0]?.holes).toHaveLength(9);
    expect(nines[0]?.totals.strokes).toBe(45);
  });

  it("leaves a missing hole empty and out of the subtotals", () => {
    const holes = Array.from({ length: 18 }, (_, index) => hole(index + 1)).filter(
      (entry) => entry.hole !== 5,
    );
    const source = card({ holes, holesCounted: 17 });
    const front = paperNines(source)[0];

    expect(front?.holes[4]).toBeNull();
    expect(paperScoreText(null)).toBe("-");
    expect(front?.totals.strokes).toBe(40);
    expect(front?.totals.played).toBe(8);
  });
});

describe("paper scorecard pickups", () => {
  const source = card({
    holes: Array.from({ length: 18 }, (_, index) => {
      const number = index + 1;
      if (number !== 3) return hole(number);
      return hole(number, {
        grossStrokes: 0,
        handicapStrokes: null,
        netStrokes: null,
        grossPoints: 0,
        netPoints: 0,
        pickedUp: true,
      });
    }),
    pickups: 1,
    holesCounted: 18,
  });

  it("shows an X and no stroke count", () => {
    const out = paperNines(source)[0];
    const pickup = out?.holes[2];

    expect(out?.holes).toHaveLength(9);
    expect(pickup?.pickedUp).toBe(true);
    expect(paperScoreText(pickup ?? null)).toBe("X");
  });

  it("leaves the pickup out of the stroke sum but keeps its points", () => {
    const out = paperNines(source)[0];

    // Eight scored holes at 5 strokes each; the pickup adds nothing.
    expect(out?.totals.strokes).toBe(40);
    expect(out?.totals.played).toBe(8);
    // Net points: eight holes at 2 plus the pickup's 0.
    expect(out?.totals.netPoints).toBe(16);
    expect(out?.totals.grossPoints).toBe(8);
  });

  it("names the pickups in the footer stroke figure", () => {
    const footer = paperFooter(source);

    expect(footer.strokesText).toBe("85 (+1 pickup)");
    expect(footer.strokes).toBe(85);
    expect(footer.playedLabel).toBe("18/18");
    expect(footer.netPoints).toBe(34);
    expect(footer.grossPoints).toBe(17);
  });

  it("uses a plain stroke figure when nothing was picked up", () => {
    expect(paperFooter(card()).strokesText).toBe("90");
  });

  it("shows a dash for an unknown net score", () => {
    expect(paperPointsText(null)).toBe("-");
    expect(paperPointsText(0)).toBe("0");
    const noHandicap = card({
      playingHandicap: null,
      netPoints: null,
      holes: Array.from({ length: 18 }, (_, index) =>
        hole(index + 1, { handicapStrokes: null, netStrokes: null, netPoints: null }),
      ),
    });
    expect(paperFooter(noHandicap).netPoints).toBeNull();
    expect(paperNineTotals(noHandicap, 1, 9).netPoints).toBeNull();
  });
});
