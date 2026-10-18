import { describe, expect, it } from "vitest";
import { handicapDots } from "./handicap-dots";

const strokeIndexes = Array.from({ length: 18 }, (_, index) => index + 1);

describe("handicapDots", () => {
  it("allocates no dots for scratch", () => {
    expect(handicapDots(0, strokeIndexes)).toEqual(Array(18).fill(0));
  });

  it("gives one dot on each hole at 18", () => {
    expect(handicapDots(18, strokeIndexes)).toEqual(Array(18).fill(1));
  });

  it("gives a second dot to the hardest hole at 19", () => {
    expect(handicapDots(19, strokeIndexes)).toEqual([2, ...Array(17).fill(1)]);
  });

  it("gives two dots on all holes at 36", () => {
    expect(handicapDots(36, strokeIndexes)).toEqual(Array(18).fill(2));
  });

  it("allocates plus-handicap strokes back from the easiest holes", () => {
    const dots = handicapDots(-2, strokeIndexes);
    expect(dots[16]).toBe(-1);
    expect(dots[17]).toBe(-1);
    expect(dots.filter((count) => count !== 0)).toHaveLength(2);
  });

  it("uses stable hole order to break stroke-index ties", () => {
    expect(handicapDots(1, [1, 1, 18])).toEqual([1, 0, 0]);
    expect(handicapDots(-1, [18, 18, 1])).toEqual([-1, 0, 0]);
  });

  it("returns no dots when handicap or stroke index data is missing", () => {
    expect(handicapDots(null, strokeIndexes)).toEqual(Array(18).fill(0));
    expect(handicapDots(Number.NaN, strokeIndexes)).toEqual(Array(18).fill(0));
    expect(handicapDots(2, [null, 0, 1])).toEqual([0, 0, 1]);
  });

  it("truncates non-integer playing handicaps to whole strokes", () => {
    expect(handicapDots(1.9, strokeIndexes)).toEqual(handicapDots(1, strokeIndexes));
  });
});
