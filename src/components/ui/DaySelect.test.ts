import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DaySelect, type DayOption, moveDayIndex, selectedDayIndex } from "./DaySelect";

const days: DayOption[] = [
  { value: 1, label: "Day 1 · Thu, Nov 12", hint: "Today" },
  { value: 2, label: "Day 2 · Fri, Nov 13" },
  { value: 3, label: "Day 3 · Sat, Nov 14" },
];

const render = (value: string | number, list: DayOption[] = days) =>
  renderToStaticMarkup(
    createElement(DaySelect, { days: list, value, onChange: () => {}, label: "Playing day" }),
  );

describe("the day list", () => {
  it("points at the chosen day, and at the first one when the choice is gone", () => {
    expect(selectedDayIndex(days, 2)).toBe(1);
    expect(selectedDayIndex(days, 9)).toBe(0);
    expect(selectedDayIndex([], 1)).toBe(0);
  });

  it("moves the highlight with the arrows and wraps at both ends", () => {
    expect(moveDayIndex(3, 0, 1)).toBe(1);
    expect(moveDayIndex(3, 2, 1)).toBe(0);
    expect(moveDayIndex(3, 0, -1)).toBe(2);
    expect(moveDayIndex(1, 0, 1)).toBe(0);
    expect(moveDayIndex(0, 0, 1)).toBe(0);
  });
});

describe("the day control", () => {
  it("is one closed combobox showing the chosen day", () => {
    const html = render(2);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("Day 2 · Fri, Nov 13");
    expect(html).toContain("min-h-12");
    // Nothing is open on arrival, so no rows are in the markup.
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain("Day 3 · Sat, Nov 14");
  });

  it("is plain text when the event has one playing day", () => {
    const html = render(1, [days[0] as DayOption]);
    expect(html).toContain("Day 1 · Thu, Nov 12");
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("<button");
  });

  it("renders nothing when there is no day at all", () => {
    expect(render(1, [])).toBe("");
  });
});
