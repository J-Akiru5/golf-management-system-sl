import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/dictionaries/en";
import { makeTranslator } from "@/lib/i18n/t";
import type { PortalScorecard, PortalScorecardHole } from "./portal";
import {
  formatToPar,
  handicapStrokeLabel,
  relationToPar,
  scorecardRows,
  teamFormatLabel,
  teamHolesForFormat,
  teamViewFor,
  totalsFor,
  withGrossEdits,
} from "./scorecard";

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

describe("relation to par", () => {
  it("counts the holes that have a score, for a nine and for the card", () => {
    const source = card({
      holes: Array.from({ length: 18 }, (_, index) => hole(index + 1, { grossStrokes: 5, par: 4 })),
    });

    expect(relationToPar(source, 1, 9)).toBe(9);
    expect(relationToPar(source)).toBe(18);
    expect(relationToPar(source, 10, 18)).toBe(9);
  });

  it("returns null when there is no hole to count", () => {
    expect(relationToPar(card({ holes: [] }), 1, 9)).toBeNull();
  });

  it("formats level, over and under par", () => {
    expect(formatToPar(null)).toBe("-");
    expect(formatToPar(0)).toBe("E");
    expect(formatToPar(4)).toBe("+4");
    expect(formatToPar(-2)).toBe("-2");
  });
});

describe("unsaved gross edit", () => {
  it("recalculates the hole's net and points and then the card totals", () => {
    const source = card();
    const edited = withGrossEdits(source, { 1: 4 });

    const first = edited.holes[0];
    expect(first?.grossStrokes).toBe(4);
    expect(first?.netStrokes).toBe(3);
    expect(first?.grossPoints).toBe(2);
    expect(first?.netPoints).toBe(3);
    expect(edited.grossStrokes).toBe(source.grossStrokes - 1);
    expect(edited.grossPoints).toBe(source.grossPoints + 1);
    if (source.netStrokes === null || source.netPoints === null) {
      throw new Error("The sample card should have net totals.");
    }
    expect(edited.netStrokes).toBe(source.netStrokes - 1);
    expect(edited.netPoints).toBe(source.netPoints + 1);

    // The published card is not mutated: the preview is a new object.
    expect(source.holes[0]?.grossStrokes).toBe(5);
  });

  it("ignores a blank, zero, fractional or unknown-hole edit", () => {
    const source = card();
    const edited = withGrossEdits(source, { 1: 0, 2: 4.5, 99: 3 });

    expect(edited).toBe(source);
  });

  it("keeps net unknown when the hole has no handicap snapshot", () => {
    const source = card({
      holes: [hole(1, { handicapStrokes: null, netStrokes: null, netPoints: null })],
      holesTotal: 1,
    });
    const edited = withGrossEdits(source, { 1: 4 });

    expect(edited.holes[0]?.netStrokes).toBeNull();
    expect(edited.holes[0]?.netPoints).toBeNull();
    expect(edited.netStrokes).toBeNull();
    expect(edited.netPoints).toBeNull();
  });
});

describe("team card input", () => {
  it("shows the team layout only when the format and its published card exist", () => {
    const partner = card({ roundId: "round-partner" });
    const shared = card({ roundId: "round-shared" });

    expect(teamViewFor("individual", partner, shared)).toEqual({
      showTeam: false,
      showPartnerNotPublished: false,
    });
    expect(teamViewFor("four-ball", partner, null)).toEqual({
      showTeam: true,
      showPartnerNotPublished: false,
    });
    expect(teamViewFor("four-ball", null, null)).toEqual({
      showTeam: false,
      showPartnerNotPublished: true,
    });
    expect(teamViewFor("aggregate", null, null)).toEqual({
      showTeam: false,
      showPartnerNotPublished: true,
    });
    expect(teamViewFor("scramble", null, shared)).toEqual({
      showTeam: true,
      showPartnerNotPublished: false,
    });
    expect(teamViewFor("scramble", partner, null)).toEqual({
      showTeam: false,
      showPartnerNotPublished: true,
    });
  });

  it("builds two players per hole for four-ball, using the partner card", () => {
    const playerCard = card({
      holesTotal: 1,
      holes: [hole(1, { grossStrokes: 5, netStrokes: 4 })],
    });
    const partnerCard = card({
      roundId: "round-partner",
      holesTotal: 1,
      holes: [hole(1, { grossStrokes: 6, netStrokes: 5 })],
    });

    const holes = teamHolesForFormat("four-ball", playerCard, partnerCard, null);
    expect(holes).toHaveLength(1);
    expect(holes[0]?.players).toEqual([
      { playerId: "you", grossStrokes: 5, netStrokes: 4 },
      { playerId: "partner", grossStrokes: 6, netStrokes: 5 },
    ]);
  });

  it("builds one shared score per hole for a scramble", () => {
    const playerCard = card({ holesTotal: 1, holes: [hole(1)] });
    const sharedCard = card({
      roundId: "round-shared",
      holesTotal: 1,
      holes: [
        hole(1, { grossStrokes: 4, handicapStrokes: null, netStrokes: null, netPoints: null }),
      ],
    });

    const holes = teamHolesForFormat("scramble", playerCard, null, sharedCard);
    expect(holes[0]?.players).toEqual([{ playerId: "team", grossStrokes: 4, netStrokes: null }]);
  });

  it("leaves the partner out when their card is missing, so the engine names the hole", () => {
    const playerCard = card({ holesTotal: 2 });
    const holes = teamHolesForFormat("four-ball", playerCard, null, null);

    expect(holes).toHaveLength(2);
    expect(holes[0]?.players).toEqual([{ playerId: "you", grossStrokes: 5, netStrokes: 4 }]);
  });

  it("returns no rows for an individual event", () => {
    expect(teamHolesForFormat("individual", card(), null, null)).toEqual([]);
  });
});

describe("team format label", () => {
  it("names every format in the reader's language", () => {
    const t = makeTranslator(en);
    expect(teamFormatLabel(t, "individual")).toBe("Individual");
    expect(teamFormatLabel(t, "four-ball")).toBe("Four-ball (best ball)");
    expect(teamFormatLabel(t, "aggregate")).toBe("Team aggregate");
    expect(teamFormatLabel(t, "scramble")).toBe("Scramble");
  });
});
