import { describe, expect, it } from "vitest";
import { reviewScannedCard, scanReview } from "./review";

const holes = [{ number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }];

const card = [
  { number: 1, par: 4 },
  { number: 2, par: 4 },
  { number: 3, par: 3 },
  { number: 4, par: 5 },
  { number: 9, par: 4 },
  { number: 10, par: 4 },
  { number: 17, par: 5 },
  { number: 18, par: 4 },
];

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

describe("reviewScannedCard", () => {
  const read = { strokes: 5, confidence: 0.97 };
  const weak = { strokes: 5, confidence: 0.62 };
  const empty = { strokes: null, confidence: 0.94 };

  it("separates a reader value from a value the reader left empty", () => {
    const review = reviewScannedCard(
      card,
      { 1: "5", 2: "4", 3: "5", 4: "5", 9: "4", 10: "4", 17: "5", 18: "4" },
      { 1: read, 2: empty, 3: weak },
    );

    expect(review.cells[1]).toMatchObject({ state: "read", label: "Read" });
    expect(review.cells[2]).toMatchObject({ state: "typed", readerStrokes: null });
    expect(review.cells[3]).toMatchObject({ state: "check", confidence: 0.62 });
    // No reader entry at all is still a value a person typed.
    expect(review.cells[4]?.state).toBe("typed");
  });

  it("marks a cell the person replaced, even when the reader was confident", () => {
    const review = reviewScannedCard(card, { 1: "6" }, { 1: read });

    expect(review.cells[1]).toMatchObject({
      state: "changed",
      label: "Changed",
      readerStrokes: 5,
    });
    expect(review.changed).toBe(1);
  });

  it("does not call a retyped value a change", () => {
    const review = reviewScannedCard(card, { 1: "5" }, { 1: weak });

    expect(review.cells[1]?.state).toBe("check");
    expect(review.changed).toBe(0);
  });

  it("leaves a cell the reader could not read empty until a person types it", () => {
    const review = reviewScannedCard(card, { 1: "" }, { 1: empty });

    expect(review.cells[1]).toMatchObject({ state: "blank", label: "Empty", readerStrokes: null });
    expect(review.blankHoles).toContain(1);
    expect(review.filled).toBe(0);
  });

  it("counts OUT, IN and TOTAL from the cells that carry a value", () => {
    const first = reviewScannedCard(card, { 1: "5", 2: "4", 9: "4", 10: "5", 18: "4" }, {});
    expect(first.totals).toMatchObject({ out: 13, in: 9, total: 22, filled: 5 });

    const corrected = reviewScannedCard(card, { 1: "6", 2: "4", 9: "4", 10: "5", 18: "4" }, {});
    expect(corrected.totals.total).toBe(23);
    expect(corrected.totals.toPar).toBe(first.totals.toPar + 1);
  });

  it("counts each kind of cell for the summary", () => {
    const review = reviewScannedCard(
      card,
      { 1: "5", 2: "4", 3: "5", 4: "" },
      { 1: read, 2: empty, 3: weak, 4: empty },
    );

    expect(review).toMatchObject({ filled: 3, blank: 5, check: 1, typed: 1, changed: 0 });
    expect(review.blankHoles).toEqual([4, 9, 10, 17, 18]);
  });

  it("never invents a score for a blank cell", () => {
    const review = reviewScannedCard(
      card,
      {},
      Object.fromEntries(card.map((h) => [h.number, empty])),
    );

    expect(review.filled).toBe(0);
    expect(review.totals.total).toBe(0);
    expect(Object.values(review.cells).every((cell) => cell.state === "blank")).toBe(true);
  });
});
