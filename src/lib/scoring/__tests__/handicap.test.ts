import { describe, expect, it } from "vitest";
import { handicapDots } from "../../print/handicap-dots";
import { allocateHandicapStrokes, calculateHandicap, handicapStrokesForHole } from "../handicap";
import type { HandicapInput, TeeRatings } from "../types";
import { TEST_HOLES, TEST_TEE } from "./fixtures";

const baseInput: HandicapInput = {
  index: 14.2,
  indexSource: "NGAP export 2026-11",
  indexEffectiveDate: "2026-11-01",
  tee: TEST_TEE,
  allowance: 1,
  rounding: "whs",
  rulesVersion: "test-rules-v1",
};

describe("WHS handicap pipeline", () => {
  const seniorTee: TeeRatings = {
    id: "senior",
    name: "Senior",
    courseRating: 70.1,
    slope: 125,
    par: 72,
  };

  it("matches the worked example in the build spec", () => {
    const result = calculateHandicap({ ...baseInput, tee: seniorTee });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.courseHandicap).toBe(14);
    expect(result.snapshot.playingHandicap).toBe(14);
    expect(result.snapshot.index).toBe(14.2);
    expect(result.snapshot.teeId).toBe("senior");
  });

  it("stores the inputs and the rules version with the result", () => {
    const result = calculateHandicap(baseInput);
    if (!result.ok) throw new Error("Expected a valid handicap.");

    expect(result.snapshot).toMatchObject({
      indexSource: "NGAP export 2026-11",
      indexEffectiveDate: "2026-11-01",
      courseRating: 71.5,
      slope: 128,
      coursePar: 72,
      allowance: 1,
      rounding: "whs",
      rulesVersion: "test-rules-v1",
    });
  });

  it("keeps the two rounding modes distinct for a non-100% allowance", () => {
    const tee: TeeRatings = {
      id: "test",
      name: "Test",
      courseRating: 72.5,
      slope: 113,
      par: 72,
    };

    const whs = calculateHandicap({ ...baseInput, index: 10.1, tee, allowance: 0.5 });
    const single = calculateHandicap({
      ...baseInput,
      index: 10.1,
      tee,
      allowance: 0.5,
      rounding: "single",
    });

    if (!whs.ok || !single.ok) throw new Error("Expected both modes to calculate.");
    expect(whs.snapshot.courseHandicap).toBe(11);
    expect(whs.snapshot.playingHandicap).toBe(6);
    expect(single.snapshot.courseHandicap).toBe(11);
    expect(single.snapshot.playingHandicap).toBe(5);
  });

  it("reports every missing input instead of inventing a value", () => {
    const result = calculateHandicap({
      index: null,
      indexSource: null,
      indexEffectiveDate: null,
      tee: null,
      allowance: null,
      rounding: "whs",
      rulesVersion: "",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((problem) => problem.code)).toEqual(
      expect.arrayContaining([
        "missing_index",
        "missing_source",
        "missing_effective_date",
        "missing_tee",
        "missing_allowance",
        "missing_rules_version",
      ]),
    );
  });

  it("rejects an index outside the WHS range", () => {
    for (const index of [54.1, -20.1, Number.NaN]) {
      const result = calculateHandicap({ ...baseInput, index });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.problems.some((problem) => problem.code === "invalid_index")).toBe(true);
      }
    }
  });

  it("rejects an allowance that is not a fraction above zero", () => {
    for (const allowance of [0, 1.2, Number.NaN]) {
      const result = calculateHandicap({ ...baseInput, allowance });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.problems.some((problem) => problem.code === "invalid_allowance")).toBe(true);
      }
    }
  });
});

describe("handicap stroke allocation", () => {
  const allocation = (playingHandicap: number) =>
    TEST_HOLES.map((hole) => handicapStrokesForHole(playingHandicap, hole.strokeIndex, 18));

  const atStrokeIndex = (values: number[], strokeIndex: number) => {
    const index = TEST_HOLES.findIndex((hole) => hole.strokeIndex === strokeIndex);
    return values[index];
  };

  it("gives nothing to a scratch player", () => {
    expect(allocation(0).every((strokes) => strokes === 0)).toBe(true);
  });

  it("gives one stroke on every hole at 18", () => {
    expect(allocation(18).every((strokes) => strokes === 1)).toBe(true);
  });

  it("gives a second stroke to the hardest hole at 19", () => {
    const values = allocation(19);
    expect(atStrokeIndex(values, 1)).toBe(2);
    expect(values.filter((strokes) => strokes === 2)).toHaveLength(1);
  });

  it("covers every hole twice at 36", () => {
    expect(allocation(36).every((strokes) => strokes === 2)).toBe(true);
  });

  it("gives plus handicaps back from the easiest holes", () => {
    const minusTwo = allocation(-2);
    expect(atStrokeIndex(minusTwo, 17)).toBe(-1);
    expect(atStrokeIndex(minusTwo, 18)).toBe(-1);
    expect(minusTwo.filter((strokes) => strokes !== 0)).toHaveLength(2);

    const minusNineteen = allocation(-19);
    expect(minusNineteen.filter((strokes) => strokes === -1)).toHaveLength(17);
    expect(atStrokeIndex(minusNineteen, 18)).toBe(-2);
  });

  it("agrees with the print centre's handicap dots on a complete 18-hole course", () => {
    const strokeIndexes = TEST_HOLES.map((hole) => hole.strokeIndex);
    for (const playingHandicap of [-18, -5, -2, -1, 0, 1, 9, 18, 19, 20, 36]) {
      expect(allocation(playingHandicap)).toEqual(handicapDots(playingHandicap, strokeIndexes));
    }
  });

  it("returns the allocation keyed by hole number", () => {
    const map = allocateHandicapStrokes(18, TEST_HOLES);
    expect(map.size).toBe(18);
    expect(map.get(1)).toBe(1);
    expect(map.get(18)).toBe(1);
  });

  it("refuses data that is not a whole stroke or a real hole", () => {
    expect(() => handicapStrokesForHole(1.5, 1, 18)).toThrow();
    expect(() => handicapStrokesForHole(1, 0, 18)).toThrow();
    expect(() => handicapStrokesForHole(1, 19, 18)).toThrow();
  });
});
