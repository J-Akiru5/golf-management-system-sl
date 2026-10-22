import { describe, expect, it } from "vitest";
import { daySelectionProblem } from "./day-selection";

describe("daySelectionProblem", () => {
  it("accepts the exact required count", () => {
    expect(daySelectionProblem([1, 2], 2, 2)).toBeNull();
  });

  it("flags too few and too many days", () => {
    expect(daySelectionProblem([1], 2, 2)).toBe("required");
    expect(daySelectionProblem([1, 2, 3], 2, 2)).toBe("required");
  });

  it("allows no rule and enforces only the maximum when it is set", () => {
    expect(daySelectionProblem([], null, null)).toBeNull();
    expect(daySelectionProblem([], null, 3)).toBeNull();
    expect(daySelectionProblem([1, 2, 3, 4], null, 3)).toBe("maximum");
  });
});
