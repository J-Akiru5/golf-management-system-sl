import { describe, expect, it } from "vitest";
import {
  barGeometry,
  formatWindow,
  GANTT_MIN_MONTHS,
  ganttColumns,
  ganttMonthSpans,
  ganttWindow,
  layoutGantt,
  todayPercent,
  visibleStart,
} from "./layout";
import type { TimelineItem } from "./types";

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: "item-1",
    kind: "card",
    title: "Item",
    detail: null,
    start: "2026-11-11",
    end: "2026-11-20",
    prepStart: null,
    milestone: false,
    href: null,
    people: [],
    basis: null,
    ...overrides,
  };
}

/** November 2026: 30 days from the 1st to the 30th. */
const NOVEMBER = { from: "2026-11-01", to: "2026-11-30", days: 30 };

describe("barGeometry", () => {
  it("places a ten-day bar at its share of the window", () => {
    const geometry = barGeometry("2026-11-11", "2026-11-20", NOVEMBER);
    expect(geometry?.leftPct).toBeCloseTo((10 / 30) * 100, 6);
    expect(geometry?.widthPct).toBeCloseTo((10 / 30) * 100, 6);
  });

  it("counts one day as one day", () => {
    const geometry = barGeometry("2026-11-01", "2026-11-01", NOVEMBER);
    expect(geometry?.leftPct).toBe(0);
    expect(geometry?.widthPct).toBeCloseTo((1 / 30) * 100, 6);
  });

  it("clips a bar that runs past the window", () => {
    const geometry = barGeometry("2026-10-20", "2026-12-10", NOVEMBER);
    expect(geometry?.leftPct).toBe(0);
    expect(geometry?.widthPct).toBeCloseTo(100, 6);
  });

  it("clips the start of a bar that began earlier", () => {
    const geometry = barGeometry("2026-10-20", "2026-11-10", NOVEMBER);
    expect(geometry?.leftPct).toBe(0);
    expect(geometry?.widthPct).toBeCloseTo((10 / 30) * 100, 6);
  });

  it("returns nothing for a bar entirely outside the window", () => {
    expect(barGeometry("2026-09-01", "2026-09-10", NOVEMBER)).toBeNull();
    expect(barGeometry("2027-01-01", "2027-01-10", NOVEMBER)).toBeNull();
  });
});

describe("todayPercent", () => {
  it("puts the line in the middle of the day it is today", () => {
    expect(todayPercent("2026-11-01", NOVEMBER)).toBeCloseTo((0.5 / 30) * 100, 6);
  });

  it("has no line when today is outside the window", () => {
    expect(todayPercent("2027-02-01", NOVEMBER)).toBeNull();
  });
});

describe("ganttWindow", () => {
  it("covers the items and today, with a minimum span", () => {
    const window = ganttWindow([item()], "2026-11-21", "month");
    expect(window.from <= "2026-11-11").toBe(true);
    expect(window.to >= "2026-11-21").toBe(true);
    expect(window.days).toBeGreaterThanOrEqual(GANTT_MIN_MONTHS * 28);
  });

  it("starts and ends on a month boundary when zoomed to months", () => {
    const window = ganttWindow(
      [item({ start: "2026-11-11", end: "2026-11-20" })],
      "2026-11-21",
      "month",
    );
    expect(window.from).toBe("2026-11-01");
    expect(window.to).toBe("2027-04-30");
  });

  it("starts and ends on a Monday and a Sunday when zoomed to weeks", () => {
    const window = ganttWindow([item()], "2026-11-21", "week");
    expect(window.from).toBe("2026-11-09");
    expect(window.to).toBe("2027-01-03");
  });

  it("includes a prep window in the earliest day", () => {
    const window = ganttWindow(
      [item({ start: "2026-12-12", end: "2026-12-13", prepStart: "2026-11-28" })],
      "2026-11-21",
      "month",
    );
    expect(window.from).toBe("2026-11-01");
  });

  it("refuses a date that is not a day", () => {
    expect(() => ganttWindow([], "2026-11-31", "month")).toThrow(/Not a day/);
  });
});

describe("the axis", () => {
  it("has one column per month, whose widths add up to the window", () => {
    const window = { from: "2026-11-01", to: "2027-01-31", days: 92 };
    const columns = ganttColumns(window, "month");
    expect(columns.map((column) => column.label)).toEqual(["Nov 2026", "Dec 2026", "Jan 2027"]);
    expect(columns.reduce((sum, column) => sum + column.widthPct, 0)).toBeCloseTo(100, 6);
    expect(columns[0]?.days).toBe(30);
  });

  it("has one column per week, with a month row above it", () => {
    const window = { from: "2026-11-02", to: "2026-11-15", days: 14 };
    const columns = ganttColumns(window, "week");
    expect(columns).toHaveLength(2);
    expect(columns[0]?.label).toBe("2 Nov");
    expect(columns[1]?.label).toBe("9 Nov");
    expect(ganttMonthSpans(window).map((span) => span.label)).toEqual(["Nov 2026"]);
  });

  it("clips the first and last week to the window", () => {
    const window = { from: "2026-11-05", to: "2026-11-10", days: 6 };
    const columns = ganttColumns(window, "week");
    expect(columns.map((column) => column.days)).toEqual([4, 2]);
    expect(columns.map((column) => column.from)).toEqual(["2026-11-05", "2026-11-09"]);
  });
});

describe("layoutGantt", () => {
  it("groups by kind in the fixed order", () => {
    const groups = layoutGantt(
      [
        item({ id: "t", kind: "task" }),
        item({ id: "c", kind: "card" }),
        item({ id: "m", kind: "milestone" }),
      ],
      NOVEMBER,
    );
    expect(groups.map((group) => group.kind)).toEqual(["card", "task", "milestone"]);
  });

  it("puts overlapping items on separate lanes and a later item back on the first", () => {
    const groups = layoutGantt(
      [
        item({ id: "a", start: "2026-11-02", end: "2026-11-10" }),
        item({ id: "b", start: "2026-11-05", end: "2026-11-08" }),
        item({ id: "c", start: "2026-11-12", end: "2026-11-14" }),
      ],
      NOVEMBER,
    );

    const bars = groups[0]?.bars ?? [];
    expect(bars.map((bar) => `${bar.item.id}:${bar.lane}`)).toEqual(["a:0", "b:1", "c:0"]);
    expect(groups[0]?.lanes).toBe(2);
  });

  it("counts the prep window as part of the drawing when stacking", () => {
    const groups = layoutGantt(
      [
        item({
          id: "event",
          kind: "tournament",
          start: "2026-12-12",
          end: "2026-12-13",
          prepStart: "2026-11-28",
        }),
        item({
          id: "card",
          kind: "tournament",
          start: "2026-11-29",
          end: "2026-11-30",
        }),
      ],
      { from: "2026-11-01", to: "2026-12-31", days: 61 },
    );

    const bars = groups[0]?.bars ?? [];
    expect(bars.map((bar) => bar.lane)).toEqual([0, 1]);
    expect(bars[0]?.prep).not.toBeNull();
    expect(visibleStart(bars[0]?.item ?? item())).toBe("2026-11-28");
  });

  it("draws the prep segment up to the day before the first playing day", () => {
    const groups = layoutGantt(
      [
        item({
          kind: "tournament",
          start: "2026-11-15",
          end: "2026-11-16",
          prepStart: "2026-11-01",
        }),
      ],
      NOVEMBER,
    );

    const bar = groups[0]?.bars[0];
    expect(bar?.prep?.leftPct).toBe(0);
    expect(bar?.prep?.widthPct).toBeCloseTo((14 / 30) * 100, 6);
    expect(bar?.play.leftPct).toBeCloseTo((14 / 30) * 100, 6);
  });

  it("has no prep segment when the item has no prep window", () => {
    const groups = layoutGantt([item()], NOVEMBER);
    expect(groups[0]?.bars[0]?.prep).toBeNull();
  });

  it("leaves out an item that falls entirely outside the window", () => {
    const groups = layoutGantt([item({ start: "2026-09-01", end: "2026-09-02" })], NOVEMBER);
    expect(groups).toEqual([]);
  });

  it("keeps a milestone as a one-day bar", () => {
    const groups = layoutGantt(
      [item({ kind: "task", milestone: true, start: "2026-11-11", end: "2026-11-11" })],
      NOVEMBER,
    );
    const bar = groups[0]?.bars[0];
    expect(bar?.play.widthPct).toBeCloseTo((1 / 30) * 100, 6);
  });

  it("writes the window in words", () => {
    expect(formatWindow({ from: "2026-11-02", to: "2026-11-15", days: 14 })).toBe(
      "2 Nov 2026 to 15 Nov 2026",
    );
  });
});
