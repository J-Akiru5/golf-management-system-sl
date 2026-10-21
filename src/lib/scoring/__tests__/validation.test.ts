import { describe, expect, it } from "vitest";
import {
  DEFAULT_STROKE_LIMITS,
  isIsoDate,
  isValidStrokes,
  validateCourseSetup,
  validateVerificationPolicy,
} from "../validation";
import { TEST_COURSE, TEST_POLICY } from "./fixtures";

const codes = (course: typeof TEST_COURSE) =>
  validateCourseSetup(course).map((problem) => problem.code);

describe("course setup", () => {
  it("accepts a complete, consistent 18-hole course", () => {
    expect(validateCourseSetup(TEST_COURSE)).toEqual([]);
  });

  it("rejects a duplicate hole", () => {
    const first = TEST_COURSE.holes[0];
    if (!first) throw new Error("Fixture has no holes.");
    expect(codes({ ...TEST_COURSE, holes: [...TEST_COURSE.holes, { ...first }] })).toContain(
      "duplicate_hole",
    );
  });

  it("rejects a missing hole", () => {
    expect(
      codes({
        ...TEST_COURSE,
        holes: TEST_COURSE.holes.filter((hole) => hole.number !== 3),
      }),
    ).toContain("hole_sequence");
  });

  it("rejects a duplicate stroke index", () => {
    expect(
      codes({
        ...TEST_COURSE,
        holes: TEST_COURSE.holes.map((hole) =>
          hole.number === 2 ? { ...hole, strokeIndex: 9 } : hole,
        ),
      }),
    ).toContain("duplicate_stroke_index");
  });

  it("rejects a par outside the supported range", () => {
    expect(
      codes({
        ...TEST_COURSE,
        holes: TEST_COURSE.holes.map((hole) => (hole.number === 1 ? { ...hole, par: 7 } : hole)),
      }),
    ).toContain("invalid_par");
  });

  it("rejects holes that do not add up to the tee par", () => {
    expect(
      codes({
        ...TEST_COURSE,
        holes: TEST_COURSE.holes.map((hole) => (hole.number === 1 ? { ...hole, par: 5 } : hole)),
      }),
    ).toContain("par_total_mismatch");
  });

  it("rejects impossible tee ratings", () => {
    expect(codes({ ...TEST_COURSE, tee: { ...TEST_COURSE.tee, slope: 200 } })).toContain(
      "invalid_tee",
    );
  });
});

describe("verification policy", () => {
  it("accepts a confirmed policy", () => {
    expect(validateVerificationPolicy(TEST_POLICY)).toEqual([]);
  });

  it("accepts an unconfirmed card count, because null is a real state", () => {
    expect(validateVerificationPolicy({ ...TEST_POLICY, requiredCards: null })).toEqual([]);
  });

  it("rejects a non-positive or fractional card count", () => {
    for (const requiredCards of [0, -1, 1.5]) {
      expect(validateVerificationPolicy({ ...TEST_POLICY, requiredCards }).length).toBeGreaterThan(
        0,
      );
    }
  });

  it("rejects an impossible confidence threshold", () => {
    for (const minOcrConfidence of [-0.1, 1.1, Number.NaN]) {
      expect(
        validateVerificationPolicy({ ...TEST_POLICY, minOcrConfidence }).length,
      ).toBeGreaterThan(0);
    }
  });
});

describe("small guards", () => {
  it("accepts a whole score inside the configured range", () => {
    expect(isValidStrokes(1, DEFAULT_STROKE_LIMITS)).toBe(true);
    expect(isValidStrokes(20, DEFAULT_STROKE_LIMITS)).toBe(true);
    expect(isValidStrokes(0, DEFAULT_STROKE_LIMITS)).toBe(false);
    expect(isValidStrokes(21, DEFAULT_STROKE_LIMITS)).toBe(false);
    expect(isValidStrokes(4.5, DEFAULT_STROKE_LIMITS)).toBe(false);
    expect(isValidStrokes(null, DEFAULT_STROKE_LIMITS)).toBe(false);
  });

  it("accepts a real calendar date and rejects an impossible one", () => {
    expect(isIsoDate("2026-11-14")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("14/11/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});
