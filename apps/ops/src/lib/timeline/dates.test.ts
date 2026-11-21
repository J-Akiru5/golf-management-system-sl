import { describe, expect, it } from "vitest";
import {
  addDays,
  dayFromTimestamp,
  daysBetween,
  eachDay,
  endOfMonth,
  endOfWeek,
  formatDay,
  formatDayLong,
  formatDayRange,
  formatMonthYear,
  isDay,
  isSameMonth,
  monthGrid,
  parseDay,
  rangesOverlap,
  startOfMonth,
  startOfWeek,
  todayKey,
  weekDays,
  weekdayIndex,
} from "./dates";

describe("parseDay", () => {
  it("reads a real day as UTC midnight", () => {
    const date = parseDay("2026-11-21");
    expect(date?.toISOString()).toBe("2026-11-21T00:00:00.000Z");
  });

  it("refuses a day that does not exist and anything that is not a day key", () => {
    expect(parseDay("2026-02-31")).toBeNull();
    expect(parseDay("2026-2-1")).toBeNull();
    expect(parseDay("21 Nov 2026")).toBeNull();
    expect(parseDay(null)).toBeNull();
    expect(parseDay(20261121)).toBeNull();
  });

  it("recognises a day key", () => {
    expect(isDay("2026-12-12")).toBe(true);
    expect(isDay("2026-12-32")).toBe(false);
  });
});

describe("day arithmetic", () => {
  it("crosses a month and a year", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-21", 14)).toBe("2026-12-05");
  });

  it("counts whole days, negative when going back", () => {
    expect(daysBetween("2026-11-01", "2026-11-21")).toBe(20);
    expect(daysBetween("2026-11-21", "2026-11-01")).toBe(-20);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("refuses a value that is not a day", () => {
    expect(() => addDays("2026-13-01", 1)).toThrow(/Not a day/);
    expect(() => daysBetween("nope", "2026-11-21")).toThrow(/Not a day/);
  });

  it("reads the day out of a timestamp", () => {
    expect(dayFromTimestamp("2026-11-18T09:15:00.000Z")).toBe("2026-11-18");
    expect(dayFromTimestamp("2026-11-18")).toBe("2026-11-18");
    expect(dayFromTimestamp("18/11/2026")).toBeNull();
    expect(dayFromTimestamp(undefined)).toBeNull();
  });

  it("asks the clock once, for the local calendar day", () => {
    expect(todayKey(new Date(2026, 10, 21, 9, 30))).toBe("2026-11-21");
    expect(todayKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
});

describe("weeks and months", () => {
  it("starts a week on Monday", () => {
    expect(startOfWeek("2026-11-21")).toBe("2026-11-16");
    expect(startOfWeek("2026-11-16")).toBe("2026-11-16");
    expect(endOfWeek("2026-11-21")).toBe("2026-11-22");
    expect(weekdayIndex("2026-11-16")).toBe(0);
    expect(weekdayIndex("2026-11-22")).toBe(6);
  });

  it("returns the seven days of the week, Monday first", () => {
    expect(weekDays("2026-11-18")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });

  it("has the first and last day of a month, including February", () => {
    expect(startOfMonth("2026-11-21")).toBe("2026-11-01");
    expect(endOfMonth("2026-11-21")).toBe("2026-11-30");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });

  it("draws a month grid of 42 days that starts on a Monday", () => {
    const grid = monthGrid("2026-11-21");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-10-26");
    expect(grid[41]).toBe("2026-12-06");
    expect(weekdayIndex(grid[0] ?? "")).toBe(0);
    expect(grid.filter((day) => isSameMonth(day, "2026-11-21"))).toHaveLength(30);
  });

  it("lists every day between two days, or nothing when the range is reversed", () => {
    expect(eachDay("2026-11-20", "2026-11-22")).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(eachDay("2026-11-22", "2026-11-20")).toEqual([]);
  });
});

describe("labels", () => {
  it("writes a day, a month and a long day", () => {
    expect(formatDay("2026-11-21")).toBe("21 Nov 2026");
    expect(formatMonthYear("2026-11-21")).toBe("November 2026");
    expect(formatDayLong("2026-11-21")).toBe("Saturday, 21 November 2026");
  });

  it("writes a range without repeating the month", () => {
    expect(formatDayRange("2026-12-12", "2026-12-12")).toBe("12 Dec 2026");
    expect(formatDayRange("2026-12-12", "2026-12-13")).toBe("12 to 13 Dec 2026");
    expect(formatDayRange("2026-11-30", "2026-12-02")).toBe("30 Nov 2026 to 2 Dec 2026");
  });

  it("keeps an unreadable value rather than guessing a date", () => {
    expect(formatDay("not a day")).toBe("not a day");
    expect(formatMonthYear("2026-11-21").startsWith("November")).toBe(true);
  });
});

describe("rangesOverlap", () => {
  it("counts a shared day in either direction", () => {
    expect(
      rangesOverlap(
        { from: "2026-11-01", to: "2026-11-05" },
        { from: "2026-11-05", to: "2026-11-09" },
      ),
    ).toBe(true);
    expect(
      rangesOverlap(
        { from: "2026-11-01", to: "2026-11-04" },
        { from: "2026-11-05", to: "2026-11-09" },
      ),
    ).toBe(false);
  });
});
