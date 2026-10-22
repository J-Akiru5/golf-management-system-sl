import { describe, expect, it } from "vitest";
import { teeAssignmentProblem } from "./tee-time";

const base = { courseHoles: 18, confirmed: false };

describe("teeAssignmentProblem", () => {
  it("accepts a complete unconfirmed assignment", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: 1 })).toBeNull();
  });

  it("accepts clearing both fields", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: null, startHole: null })).toBeNull();
  });

  it("refuses one field without the other", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: null })).toBe(
      "both_or_neither",
    );
    expect(teeAssignmentProblem({ ...base, teeTime: null, startHole: 1 })).toBe("both_or_neither");
  });

  it("refuses a hole outside the course", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: 19 })).toBe("hole_range");
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: 0 })).toBe("hole_range");
  });

  it("refuses a confirmed assignment with no fields", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: null, startHole: null, confirmed: true })).toBe(
      "confirmed_needs_both",
    );
  });
});
