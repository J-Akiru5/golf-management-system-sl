import { describe, expect, it } from "vitest";
import type { PortalEntry } from "./portal";
import {
  dayLabel,
  defaultDayIndex,
  entryDates,
  formatDuration,
  manilaStartIso,
  publishedDayIndex,
  sessionOf,
  teeCountdown,
  teeDays,
} from "./tee-time";

const baseEntry = (over: Partial<PortalEntry> = {}): PortalEntry => ({
  tournamentId: "t1",
  eventName: "Bamboo Tee",
  eventDate: "2026-11-12",
  dates: [],
  startFormat: "shotgun",
  firstTeeTime: "06:30",
  state: "published",
  status: "ok",
  reasons: [],
  frozenIndex: 12.4,
  playingHandicap: 13,
  category: "Regular",
  tee: "White",
  flight: "Flight A",
  paymentStatus: "paid",
  published: true,
  start: { dayNumber: 1, hole: 10, wave: null, time: "06:30" },
  starts: [],
  scorecards: [],
  ...over,
});

describe("playing days", () => {
  it("prefers the structured days, then the older single date", () => {
    expect(entryDates(baseEntry())).toEqual(["2026-11-12"]);
    expect(entryDates(baseEntry({ dates: ["2026-11-14", "2026-11-12"] }))).toEqual([
      "2026-11-12",
      "2026-11-14",
    ]);
    expect(entryDates(baseEntry({ dates: ["not-a-day"], eventDate: null }))).toEqual([]);
  });

  it("puts the published snapshot on today, else the next day, else the last played", () => {
    const dates = ["2026-11-12", "2026-11-13", "2026-11-14"];
    expect(publishedDayIndex(dates, "2026-11-13")).toBe(1);
    expect(publishedDayIndex(dates, "2026-11-10")).toBe(0);
    expect(publishedDayIndex(dates, "2026-11-20")).toBe(2);
    expect(publishedDayIndex([], "2026-11-20")).toBe(-1);
  });

  it("gives the start to one day only and leaves the other days honest", () => {
    const days = teeDays(baseEntry({ dates: ["2026-11-12", "2026-11-13"] }), "2026-11-12");
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({
      dayNumber: 1,
      isToday: true,
      hasStart: true,
      time: "06:30",
      hole: 10,
      session: "AM",
      flight: "Flight A",
    });
    expect(days[1]).toMatchObject({
      dayNumber: 2,
      isToday: false,
      hasStart: false,
      time: null,
      hole: null,
      session: null,
    });
  });

  it("uses the tee label rule for a two-tee start", () => {
    const days = teeDays(
      baseEntry({
        startFormat: "two_tee",
        start: { dayNumber: 1, hole: 1, wave: null, time: "12:30" },
      }),
      "2026-11-12",
    );
    expect(days[0]?.session).toBe("PM");
  });

  it("opens on today when the event is being played, else on the published day", () => {
    const days = teeDays(baseEntry({ dates: ["2026-11-12", "2026-11-13"] }), "2026-11-13");
    expect(defaultDayIndex(days, "2026-11-13")).toBe(1);
    const before = teeDays(baseEntry({ dates: ["2026-11-12", "2026-11-13"] }), "2026-11-01");
    expect(defaultDayIndex(before, "2026-11-01")).toBe(0);
    expect(defaultDayIndex([], "2026-11-01")).toBe(0);
  });

  it("writes the day the way people say it", () => {
    expect(dayLabel("2026-11-12")).toBe("Thu, Nov 12");
    expect(dayLabel("nope")).toBe("nope");
  });
});

describe("countdown", () => {
  it("builds a real instant in Manila time", () => {
    expect(manilaStartIso("2026-11-12", "06:30")).toBe("2026-11-12T06:30:00+08:00");
    expect(manilaStartIso("2026-11-12", "6:30:00")).toBe("2026-11-12T06:30:00+08:00");
    expect(manilaStartIso("2026-11-12", null)).toBeNull();
    expect(manilaStartIso("12 Nov", "06:30")).toBeNull();
    expect(manilaStartIso("2026-11-12", "25:00")).toBeNull();
  });

  it("counts down, holds the last minute, and stops at the tee", () => {
    const start = "2026-11-12T06:30:00+08:00";
    const before = new Date("2026-11-12T05:10:00+08:00");
    expect(teeCountdown(start, before)).toEqual({ kind: "before", ms: 80 * 60_000 });
    expect(teeCountdown(start, new Date("2026-11-12T06:29:30+08:00"))).toEqual({
      kind: "starting",
    });
    expect(teeCountdown(start, new Date("2026-11-12T06:30:00+08:00"))).toEqual({ kind: "after" });
    expect(teeCountdown(null, before)).toBeNull();
  });

  it("formats a duration the way a person reads it", () => {
    expect(formatDuration(80 * 60_000)).toBe("1h 20m");
    expect(formatDuration(45 * 60_000)).toBe("45m");
    expect(formatDuration(120 * 60_000)).toBe("2h");
    expect(formatDuration(26 * 3_600_000)).toBe("1d 2h");
    expect(formatDuration(-5)).toBe("0m");
  });

  it("names the session from the stored time", () => {
    expect(sessionOf("06:30", 0, 1)).toBe("AM");
    expect(sessionOf("12:30", 0, 1)).toBe("PM");
    expect(sessionOf(null, 0, 1)).toBeNull();
  });
});
