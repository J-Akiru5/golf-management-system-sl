import { describe, expect, it } from "vitest";
import { daySelectionProblem, pruneDaySessions } from "./day-selection";

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

describe("pruneDaySessions", () => {
  it("keeps the session of every selected middle day", () => {
    expect(pruneDaySessions([1, 2], { 1: "AM", 2: "PM" }, 3)).toEqual({ 1: "AM", 2: "PM" });
  });

  it("drops a session on a day the player is not playing", () => {
    expect(pruneDaySessions([2], { 1: "AM", 2: "PM" }, 3)).toEqual({ 2: "PM" });
  });

  it("keeps a session on the last day, which also runs a morning and an afternoon", () => {
    expect(pruneDaySessions([2, 3], { 2: "AM", 3: "PM" }, 3)).toEqual({ 2: "AM", 3: "PM" });
  });

  it("drops a day the event does not have", () => {
    expect(pruneDaySessions([1, 7], { 1: "AM", 7: "PM" }, 3)).toEqual({ 1: "AM" });
  });
});
