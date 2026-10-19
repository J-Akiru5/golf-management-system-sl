import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clampHeight,
  draggedHeight,
  fitTextareaHeight,
  keyboardHeight,
  RESIZE_PAGE,
  RESIZE_STEP,
  TEXTAREA_MIN_HEIGHT,
} from "./textarea-size";

describe("fitting a textarea to its text", () => {
  it("never goes below the minimum, even with empty or unreadable content", () => {
    expect(fitTextareaHeight(0, 2, TEXTAREA_MIN_HEIGHT)).toBe(TEXTAREA_MIN_HEIGHT);
    expect(fitTextareaHeight(-10, 2, TEXTAREA_MIN_HEIGHT)).toBe(TEXTAREA_MIN_HEIGHT);
    expect(fitTextareaHeight(Number.NaN, 2, TEXTAREA_MIN_HEIGHT)).toBe(TEXTAREA_MIN_HEIGHT);
  });

  it("includes the border and rounds up, so the last line never loses a pixel", () => {
    expect(fitTextareaHeight(80.2, 2, TEXTAREA_MIN_HEIGHT)).toBe(83);
    expect(fitTextareaHeight(80, 0, TEXTAREA_MIN_HEIGHT)).toBe(80);
  });

  it("ignores a negative border rather than shrinking the text", () => {
    expect(fitTextareaHeight(80, -4, TEXTAREA_MIN_HEIGHT)).toBe(80);
  });

  it("keeps a height inside the allowed range", () => {
    expect(clampHeight(50, 64, 400)).toBe(64);
    expect(clampHeight(500, 64, 400)).toBe(400);
    expect(clampHeight(120, 64, 400)).toBe(120);
    expect(clampHeight(Number.NaN, 64, 400)).toBe(64);
  });
});

describe("dragging an edge", () => {
  const start = { startHeight: 120, startY: 300, minHeight: 100, maxHeight: 500 };

  it("grows when the top edge is pulled up", () => {
    expect(draggedHeight({ ...start, edge: "top", currentY: 260 })).toBe(160);
  });

  it("grows when the bottom edge is pulled down", () => {
    expect(draggedHeight({ ...start, edge: "bottom", currentY: 340 })).toBe(160);
  });

  it("shrinks in the opposite direction, but never below the text", () => {
    expect(draggedHeight({ ...start, edge: "top", currentY: 360 })).toBe(100);
    expect(draggedHeight({ ...start, edge: "bottom", currentY: 240 })).toBe(100);
  });

  it("stops at the largest allowed height", () => {
    expect(draggedHeight({ ...start, edge: "bottom", currentY: 900 })).toBe(500);
  });
});

describe("resizing from the keyboard", () => {
  const base = { currentHeight: 200, minHeight: 100, maxHeight: 400 };

  it("moves by one step with the arrow keys", () => {
    expect(keyboardHeight({ ...base, key: "ArrowUp" })).toBe(200 + RESIZE_STEP);
    expect(keyboardHeight({ ...base, key: "ArrowDown" })).toBe(200 - RESIZE_STEP);
  });

  it("moves by a page with Page Up and Page Down", () => {
    expect(keyboardHeight({ ...base, key: "PageUp" })).toBe(200 + RESIZE_PAGE);
    expect(keyboardHeight({ ...base, key: "PageDown" })).toBe(200 - RESIZE_PAGE);
  });

  it("returns to the text height on Home and opens fully on End", () => {
    expect(keyboardHeight({ ...base, key: "Home" })).toBe(base.minHeight);
    expect(keyboardHeight({ ...base, key: "End" })).toBe(base.maxHeight);
  });

  it("accepts a larger step and stays inside the range", () => {
    expect(keyboardHeight({ ...base, key: "ArrowUp", step: 150 })).toBe(350);
    expect(keyboardHeight({ ...base, key: "ArrowUp", step: 1000 })).toBe(base.maxHeight);
  });

  it("leaves every other key to the textarea", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "Enter", "a", "Tab", "Escape"]) {
      expect(keyboardHeight({ ...base, key }), key).toBeNull();
    }
  });
});

describe("the shared textarea defaults", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

  it("sizes to the content and wraps long words instead of cutting them", () => {
    expect(css).toContain(`min-height: ${TEXTAREA_MIN_HEIGHT}px;`);
    expect(css).toContain("field-sizing: content;");
    expect(css).toContain("overflow-wrap: break-word;");
  });
});
