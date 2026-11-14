import { describe, expect, it } from "vitest";
import { SCROLL_EMPTY_HOLD_MS, scrollPass } from "./scroll";

const LIST = 1_000;
const VIEW = 400;
const SPEED = 100; // 100 px a second
// 400 down to -1000 is 1400 px of travel, so 14 seconds.
const TRAVEL_MS = 14_000;

describe("scrollPass", () => {
  it("starts with the column empty and the list below it", () => {
    expect(scrollPass(0, LIST, VIEW, SPEED)).toEqual({ y: VIEW, done: false });
    expect(scrollPass(SCROLL_EMPTY_HOLD_MS, LIST, VIEW, SPEED)).toEqual({
      y: VIEW,
      done: false,
    });
  });

  it("rises a pixel for every pixel of travel", () => {
    expect(scrollPass(SCROLL_EMPTY_HOLD_MS + 1_000, LIST, VIEW, SPEED)).toEqual({
      y: VIEW - 100,
      done: false,
    });
    expect(scrollPass(SCROLL_EMPTY_HOLD_MS + 5_000, LIST, VIEW, SPEED)).toEqual({
      y: VIEW - 500,
      done: false,
    });
  });

  it("keeps moving until the last row has left the top of the column", () => {
    // The last row is on screen here...
    const lastRowVisible = scrollPass(SCROLL_EMPTY_HOLD_MS + TRAVEL_MS - 1, LIST, VIEW, SPEED);
    expect(lastRowVisible.done).toBe(false);
    expect(lastRowVisible.y).toBeLessThan(-(LIST - VIEW));

    // ...and the pass ends only once the whole list is above the column.
    const end = scrollPass(SCROLL_EMPTY_HOLD_MS + TRAVEL_MS, LIST, VIEW, SPEED);
    expect(end).toEqual({ y: -LIST, done: true });
    // Nothing of the list is left in the column.
    expect(end.y + LIST).toBe(0);
  });

  it("shows a list that fits the column whole, and an empty list as nothing", () => {
    expect(scrollPass(0, VIEW, VIEW, SPEED)).toEqual({ y: 0, done: true });
    expect(scrollPass(0, 0, VIEW, SPEED)).toEqual({ y: 0, done: true });
  });

  it("copes with a zero speed", () => {
    expect(scrollPass(5_000, LIST, VIEW, SPEED).y).toBe(-20);
    expect(scrollPass(5_000, LIST, VIEW, 0).done).toBe(false);
    expect(scrollPass(5_000, LIST, VIEW, 0).y).toBeLessThan(VIEW);
  });
});
