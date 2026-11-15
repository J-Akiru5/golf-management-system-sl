import { describe, expect, it } from "vitest";
import { handicapDots } from "../../print/handicap-dots";
import {
  allocateHandicapStrokes,
  calculateHandicap,
  checkHandicapSnapshot,
  handicapStrokesForHole,
} from "../handicap";
import type { HandicapInput, TeeRatings } from "../types";
import { handicapSnapshotProblems } from "../validation";
import { makeSnapshotFor, TEST_HOLES, TEST_TEE } from "./fixtures";

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

describe("handicap snapshot check", () => {
  const snapshot = makeSnapshotFor(14.2);

  it("reports agreement without inventing a mismatch", () => {
    expect(
      checkHandicapSnapshot({
        handicap: snapshot,
        frozenIndex: 14.2,
        roundTeeId: snapshot.teeId,
      }),
    ).toEqual({
      snapshotIndex: 14.2,
      frozenIndex: 14.2,
      indexDiffers: false,
      teeDiffers: false,
    });
  });

  it("flags a frozen index that differs from the round snapshot", () => {
    const check = checkHandicapSnapshot({
      handicap: snapshot,
      frozenIndex: 13.1,
      roundTeeId: snapshot.teeId,
    });
    expect(check.indexDiffers).toBe(true);
    expect(check.frozenIndex).toBe(13.1);
    expect(check.snapshotIndex).toBe(14.2);
  });

  it("stays silent when the freeze was not loaded, rather than guessing", () => {
    const check = checkHandicapSnapshot({
      handicap: snapshot,
      frozenIndex: undefined,
      roundTeeId: snapshot.teeId,
    });
    expect(check.frozenIndex).toBeNull();
    expect(check.indexDiffers).toBe(false);
  });

  it("does not compare the index of a card snapshot, whose index column holds the playing handicap", () => {
    const cardSnapshot = { ...snapshot, rounding: "card" as const, index: 19 };
    const check = checkHandicapSnapshot({
      handicap: cardSnapshot,
      frozenIndex: 16.4,
      roundTeeId: snapshot.teeId,
    });
    expect(check.snapshotIndex).toBe(19);
    expect(check.frozenIndex).toBe(16.4);
    expect(check.indexDiffers).toBe(false);
  });

  it("flags a snapshot taken from another tee", () => {
    const check = checkHandicapSnapshot({
      handicap: snapshot,
      frozenIndex: 14.2,
      roundTeeId: "another-tee",
    });
    expect(check.teeDiffers).toBe(true);
  });

  it("has nothing to compare when the player has no snapshot", () => {
    expect(
      checkHandicapSnapshot({ handicap: null, frozenIndex: 14.2, roundTeeId: TEST_TEE.id }),
    ).toEqual({
      snapshotIndex: null,
      frozenIndex: 14.2,
      indexDiffers: false,
      teeDiffers: false,
    });
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

  it("gives a third stroke to the hardest holes above 36", () => {
    const values = allocation(40);
    expect(atStrokeIndex(values, 1)).toBe(3);
    expect(atStrokeIndex(values, 2)).toBe(3);
    expect(atStrokeIndex(values, 3)).toBe(3);
    expect(atStrokeIndex(values, 4)).toBe(3);
    expect(atStrokeIndex(values, 5)).toBe(2);
    expect(values.filter((strokes) => strokes === 3)).toHaveLength(4);
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

describe("the playing handicap cap (owner's decision, 14 Nov 2026)", () => {
  // 30 x (130 / 113) + (69.6 - 70) = 34.1, so the club's table reads 34 on this tee.
  const blueTee: TeeRatings = {
    id: "blue",
    name: "Blue",
    courseRating: 69.6,
    slope: 130,
    par: 70,
  };
  const capInput: HandicapInput = { ...baseInput, index: 30, tee: blueTee };

  it("holds the playing handicap to the event maximum and records the cap", () => {
    const uncapped = calculateHandicap(capInput);
    if (!uncapped.ok) throw new Error("expected a snapshot");
    expect(uncapped.snapshot.courseHandicap).toBe(34);
    expect(uncapped.snapshot.playingHandicap).toBe(34);

    const capped = calculateHandicap({ ...capInput, playingCap: 30 });
    if (!capped.ok) throw new Error("expected a snapshot");
    expect(capped.snapshot.courseHandicap).toBe(34);
    expect(capped.snapshot.playingHandicap).toBe(30);
    expect(capped.snapshot.playingCap).toBe(30);
  });

  it("leaves a lower handicap and a plus handicap alone", () => {
    const lower = calculateHandicap({ ...capInput, index: 14.2, playingCap: 30 });
    const plain = calculateHandicap({ ...capInput, index: 14.2 });
    if (!lower.ok || !plain.ok) throw new Error("expected snapshots");
    expect(lower.snapshot.playingHandicap).toBe(plain.snapshot.playingHandicap);

    const plus = calculateHandicap({ ...capInput, index: -2, playingCap: 30 });
    if (!plus.ok) throw new Error("expected a snapshot");
    expect(plus.snapshot.playingHandicap).toBeLessThan(0);
  });

  it("accepts a capped snapshot, and flags the same one when the cap is not known", () => {
    const capped = calculateHandicap({ ...capInput, playingCap: 30 });
    if (!capped.ok) throw new Error("expected a snapshot");
    expect(handicapSnapshotProblems(capped.snapshot)).toEqual([]);

    // The database does not store the cap: a mapper that forgets to fill it would make every capped
    // player's net score unavailable. That is why the mapper sets it, and why this is checked.
    const { playingCap: _dropped, ...withoutCap } = capped.snapshot;
    expect(handicapSnapshotProblems(withoutCap)).toContain(
      "The snapshot Playing Handicap does not match its inputs.",
    );
  });

  it("still refuses a playing handicap that is wrong for its inputs", () => {
    const capped = calculateHandicap({ ...capInput, playingCap: 30 });
    if (!capped.ok) throw new Error("expected a snapshot");
    expect(handicapSnapshotProblems({ ...capped.snapshot, playingHandicap: 31 })).toContain(
      "The snapshot Playing Handicap does not match its inputs.",
    );
  });
});
