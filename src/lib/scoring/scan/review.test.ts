import { describe, expect, it } from "vitest";
import { scanReview } from "./review";

const holes = [{ number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }];

describe("scanReview", () => {
  it("marks a hole blank when there is no value", () => {
    const review = scanReview(holes, { 1: "5", 2: "", 3: "4", 4: "6" }, {});
    expect(review.holes[2]).toBe("blank");
    expect(review.blank).toBe(1);
    expect(review.filled).toBe(3);
  });

  it("flags a confident reading as fine", () => {
    const review = scanReview(holes, { 1: "5" }, { 1: 0.97 });
    expect(review.holes[1]).toBe("ok");
    expect(review.weak).toBe(0);
  });

  it("flags a low-confidence reading for checking", () => {
    const review = scanReview(holes, { 1: "5" }, { 1: 0.62 });
    expect(review.holes[1]).toBe("check");
    expect(review.weak).toBe(1);
  });

  it("flags a cell the reader could not read, even if the desk typed a value", () => {
    const review = scanReview(holes, { 1: "5" }, { 1: null });
    expect(review.holes[1]).toBe("check");
  });

  it("does not flag a value the reader never saw", () => {
    const review = scanReview(holes, { 1: "5" }, {});
    expect(review.holes[1]).toBe("ok");
    expect(review.weak).toBe(0);
  });

  it("counts a card with mixed readings", () => {
    const review = scanReview(
      holes,
      { 1: "5", 2: "", 3: "4", 4: "7" },
      { 1: 0.99, 2: null, 3: 0.7 },
    );
    expect(review).toMatchObject({ filled: 3, blank: 1, weak: 1 });
    expect(review.holes).toEqual({ 1: "ok", 2: "blank", 3: "check", 4: "ok" });
  });

  it("treats whitespace as blank", () => {
    expect(scanReview(holes, { 1: "   " }, { 1: 0.99 }).holes[1]).toBe("blank");
  });
});
