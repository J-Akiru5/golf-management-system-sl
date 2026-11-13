import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { playingHandicap } from "../routing/handicap";
import type { Tee } from "../routing/types";
import { handicapStrokesForHole } from "../scoring/handicap";

/**
 * The tabulation page is static HTML with its own copy of the handicap rules. This test pulls that
 * block out of the page and holds it equal to the system's engine, so the two cannot drift apart.
 */
const html = readFileSync(join(process.cwd(), "public/scorecard/index.html"), "utf8");
const block = html.split("// <handicap-rules>")[1]?.split("// </handicap-rules>")[0] ?? "";

const PAR = [4, 4, 4, 5, 3, 4, 4, 4, 4, 3, 4, 4, 3, 5, 4, 3, 4, 4];
const SI = [5, 3, 7, 9, 17, 15, 11, 1, 13, 14, 6, 12, 16, 2, 4, 18, 8, 10];
const PAR_TOTAL = PAR.reduce((a, b) => a + b, 0);
const TEES = {
  B: { rating: 69.6, slope: 130 },
  W: { rating: 67.9, slope: 127 },
  L: { rating: 72.1, slope: 126 },
} as const;

interface FieldEntry {
  playingHandicap: number | null;
  frozenIndex: number | null;
}

function load(mode: "written" | "whs", field: FieldEntry | null = null) {
  const factory = new Function(
    "state",
    "TEES",
    "PAR",
    "SI",
    "sum",
    "fieldFor",
    `${block}; return { cardHcp, systemHcp, playingHcp, strokesOn, setHandicapLimits, fmtPh };`,
  );
  return factory(
    { mode },
    TEES,
    PAR,
    SI,
    (values: number[]) => values.reduce((a, b) => a + b, 0),
    () => field,
  ) as {
    cardHcp: (card: { hdcp: string; tee: string }) => number | null;
    systemHcp: (card: { name: string }) => number | null;
    playingHcp: (card: { hdcp: string; tee: string; name: string }) => number | null;
    strokesOn: (ph: number, hole: number) => number;
    setHandicapLimits: (maxIndex: number, allowance: number) => void;
    fmtPh: (ph: number) => string;
  };
}

describe("tabulation page handicap rules", () => {
  it("found the handicap block in the page", () => {
    expect(block.length).toBeGreaterThan(200);
  });

  it("uses the card HDCP as the playing handicap with the decimal dropped", () => {
    const page = load("written");
    expect(page.cardHcp({ hdcp: "16.7", tee: "B" })).toBe(16);
    expect(page.cardHcp({ hdcp: "14", tee: "B" })).toBe(14);
    expect(page.cardHcp({ hdcp: "0.4", tee: "B" })).toBe(0);
    expect(page.cardHcp({ hdcp: "", tee: "B" })).toBeNull();
    expect(page.cardHcp({ hdcp: "NH", tee: "B" })).toBeNull();
  });

  it("treats a plus handicap as negative, like the system", () => {
    const page = load("written");
    expect(page.cardHcp({ hdcp: "+2", tee: "B" })).toBe(-2);
    expect(page.cardHcp({ hdcp: "+1.9", tee: "B" })).toBe(-1);
    expect(page.fmtPh(-2)).toBe("+2");
    expect(page.fmtPh(16)).toBe("16");
  });

  it("converts an index exactly as the draw does, capped at the maximum, over a grid", () => {
    for (const allowance of [1, 0.95]) {
      const page = load("whs");
      page.setHandicapLimits(30, allowance);
      for (const [code, tee] of Object.entries(TEES)) {
        const engineTee: Tee = {
          id: code,
          name: code,
          courseRating: tee.rating,
          slope: tee.slope,
          par: PAR_TOTAL,
        } as Tee;
        for (let tenths = -50; tenths <= 600; tenths += 1) {
          const index = tenths / 10;
          const hdcp = index < 0 ? `+${(-index).toFixed(1)}` : index.toFixed(1);
          const expected = playingHandicap(Math.min(index, 30), engineTee, allowance);
          expect(page.cardHcp({ hdcp, tee: code }), `${code} index ${index} at ${allowance}`).toBe(
            expected,
          );
        }
      }
    }
  });

  it("gives the same strokes on every hole as the scoring engine, including plus handicaps", () => {
    const page = load("written");
    for (let ph = -6; ph <= 60; ph += 1) {
      for (let hole = 0; hole < 18; hole += 1) {
        expect(page.strokesOn(ph, hole), `ph ${ph} hole ${hole + 1}`).toBe(
          handicapStrokesForHole(ph, SI[hole] as number, 18),
        );
      }
    }
  });

  it("falls back to the system's playing handicap only when the card has no HDCP", () => {
    const withSystem = load("written", { playingHandicap: 14, frozenIndex: 12.4 });
    expect(withSystem.playingHcp({ hdcp: "", tee: "B", name: "A" })).toBe(14);
    expect(withSystem.playingHcp({ hdcp: "9.8", tee: "B", name: "A" })).toBe(9);
  });

  it("does not trust a system handicap of 0 beside an index of 1 or more", () => {
    const page = load("written", { playingHandicap: 0, frozenIndex: 8.2 });
    expect(page.playingHcp({ hdcp: "", tee: "B", name: "A" })).toBeNull();
    const noPlayer = load("written", null);
    expect(noPlayer.playingHcp({ hdcp: "", tee: "B", name: "A" })).toBeNull();
  });

  it("ignores a bad maximum or allowance and keeps 30 and 100%", () => {
    const page = load("whs");
    page.setHandicapLimits(Number.NaN, 0);
    page.setHandicapLimits(0, 1.5);
    const tee: Tee = {
      id: "B",
      name: "B",
      courseRating: 69.6,
      slope: 130,
      par: PAR_TOTAL,
    } as Tee;
    expect(page.cardHcp({ hdcp: "45", tee: "B" })).toBe(playingHandicap(30, tee, 1));
  });
});
