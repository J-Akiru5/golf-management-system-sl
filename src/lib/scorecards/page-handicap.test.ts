import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { playingHandicap } from "../routing/handicap";
import type { Tee } from "../routing/types";
import { handicapStrokesForHole } from "../scoring/handicap";

/**
 * The tabulation page is static HTML with its own copy of the handicap rules. This test pulls that
 * block out of the page and holds it equal to the system's engine, so the two cannot drift apart.
 *
 * The page's rule is the owner's (14 Nov 2026): the playing handicap is the admin's index converted
 * on the tee written on the card, and the number in the card's HDCP box never decides anything.
 */
const html = readFileSync(join(process.cwd(), "public/scorecard/index.html"), "utf8");
const block = html.split("// <handicap-rules>")[1]?.split("// </handicap-rules>")[0] ?? "";

const PAR = [4, 4, 4, 5, 3, 4, 4, 4, 4, 3, 4, 4, 3, 5, 4, 3, 4, 4];
const SI = [5, 3, 7, 9, 17, 15, 11, 1, 13, 14, 6, 12, 16, 2, 4, 18, 8, 10];
const PAR_TOTAL = PAR.reduce((a, b) => a + b, 0);
const TEES: Record<string, { rating: number; slope: number; par?: number }> = {
  B: { rating: 69.6, slope: 130 },
  W: { rating: 67.9, slope: 127 },
  L: { rating: 72.1, slope: 126 },
};

interface FieldEntry {
  playingHandicap: number | null;
  frozenIndex: number | null;
}

function load(field: FieldEntry | null = null, tees: unknown = TEES) {
  const factory = new Function(
    "state",
    "TEES",
    "PAR",
    "SI",
    "sum",
    "fieldFor",
    `${block}; return { cardHcp, whsHcp, playingHcp, strokesOn, setHandicapLimits, fmtPh };`,
  );
  return factory(
    {},
    tees,
    PAR,
    SI,
    (values: number[]) => values.reduce((a, b) => a + b, 0),
    () => field,
  ) as {
    cardHcp: (card: { hdcp: string; tee: string }) => number | null;
    whsHcp: (index: number | null, code: string) => number | null;
    playingHcp: (card: { hdcp: string; tee: string; name: string }) => number | null;
    strokesOn: (ph: number, hole: number) => number;
    setHandicapLimits: (maxIndex: number, allowance: number) => void;
    fmtPh: (ph: number) => string;
  };
}

function engineTee(code: string, ratings = TEES): Tee {
  const tee = (ratings as Record<string, { rating: number; slope: number; par?: number }>)[code];
  return {
    id: code,
    name: code,
    courseRating: tee?.rating ?? 0,
    slope: tee?.slope ?? 113,
    par: tee?.par ?? PAR_TOTAL,
  } as Tee;
}

describe("tabulation page handicap rules", () => {
  it("found the handicap block in the page", () => {
    expect(block.length).toBeGreaterThan(200);
  });

  it("reads the card's HDCP box as a whole number, decimal dropped", () => {
    const page = load();
    expect(page.cardHcp({ hdcp: "16.7", tee: "B" })).toBe(16);
    expect(page.cardHcp({ hdcp: "14", tee: "B" })).toBe(14);
    expect(page.cardHcp({ hdcp: "0.4", tee: "B" })).toBe(0);
    expect(page.cardHcp({ hdcp: "", tee: "B" })).toBeNull();
    expect(page.cardHcp({ hdcp: "NH", tee: "B" })).toBeNull();
  });

  it("treats a plus handicap as negative, like the system", () => {
    const page = load();
    expect(page.cardHcp({ hdcp: "+2", tee: "B" })).toBe(-2);
    expect(page.cardHcp({ hdcp: "+1.9", tee: "B" })).toBe(-1);
    expect(page.fmtPh(-2)).toBe("+2");
    expect(page.fmtPh(16)).toBe("16");
  });

  it("converts an index exactly as the draw does, capped at the maximum, over a grid", () => {
    for (const allowance of [1, 0.95]) {
      const page = load();
      page.setHandicapLimits(30, allowance);
      for (const [code] of Object.entries(TEES)) {
        const tee = engineTee(code);
        for (let tenths = -50; tenths <= 600; tenths += 1) {
          const index = tenths / 10;
          const expected = playingHandicap(Math.min(index, 30), tee, allowance);
          expect(page.whsHcp(index, code), `${code} index ${index} at ${allowance}`).toBe(expected);
        }
      }
    }
  });

  it("gives the same strokes on every hole as the scoring engine, including plus handicaps", () => {
    const page = load();
    for (let ph = -6; ph <= 60; ph += 1) {
      for (let hole = 0; hole < 18; hole += 1) {
        expect(page.strokesOn(ph, hole), `ph ${ph} hole ${hole + 1}`).toBe(
          handicapStrokesForHole(ph, SI[hole] as number, 18),
        );
      }
    }
  });

  it("plays off the system's index on the tee on the card, never the card's HDCP box", () => {
    const page = load({ playingHandicap: 14, frozenIndex: 12.4 });
    expect(page.playingHcp({ hdcp: "", tee: "B", name: "A" })).toBe(14);
    expect(page.playingHcp({ hdcp: "9.8", tee: "B", name: "A" })).toBe(14);
    expect(page.playingHcp({ hdcp: "9.8", tee: "W", name: "A" })).toBe(12);
    expect(page.playingHcp({ hdcp: "", tee: "L", name: "A" })).toBe(16);
  });

  it("uses the tee's own par when the field list supplies it", () => {
    const tees = { B: { rating: 69.6, slope: 130, par: 72 } };
    const page = load(null, tees);
    page.setHandicapLimits(30, 1);
    for (const index of [0, 4.2, 12.4, 18, 30]) {
      expect(page.whsHcp(index, "B"), `index ${index}`).toBe(
        playingHandicap(index, engineTee("B", tees), 1),
      );
    }
    // Without the par the block falls back to the hole pars, which is the bundled page's copy.
    expect(load().whsHcp(12.4, "B")).toBe(playingHandicap(12.4, engineTee("B"), 1));
  });

  it("is not a handicap when the index is 0 or missing", () => {
    const zero = load({ playingHandicap: 12, frozenIndex: 0 });
    expect(zero.playingHcp({ hdcp: "12", tee: "B", name: "A" })).toBeNull();
    const missing = load({ playingHandicap: 12, frozenIndex: null });
    expect(missing.playingHcp({ hdcp: "", tee: "B", name: "A" })).toBeNull();
    const stranger = load(null);
    expect(stranger.playingHcp({ hdcp: "12", tee: "B", name: "A" })).toBeNull();
  });

  it("falls back to the stored figure only when the card has no tee letter", () => {
    const page = load({ playingHandicap: 11, frozenIndex: 12.4 });
    expect(page.playingHcp({ hdcp: "", tee: "", name: "A" })).toBe(11);
    const unset = load({ playingHandicap: 0, frozenIndex: 8.2 });
    expect(unset.playingHcp({ hdcp: "", tee: "", name: "A" })).toBeNull();
    expect(unset.playingHcp({ hdcp: "", tee: "B", name: "A" })).toBe(9);
  });

  it("ignores a bad maximum or allowance and keeps 30 and 100%", () => {
    const page = load();
    page.setHandicapLimits(Number.NaN, 0);
    page.setHandicapLimits(0, 1.5);
    expect(page.whsHcp(45, "B")).toBe(playingHandicap(30, engineTee("B"), 1));
  });
});
