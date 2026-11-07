import { describe, expect, it } from "vitest";
import type { TournamentDay } from "@/lib/data/types";
import { chooseDay, dayNotice, dayNumberForDate, fmtDayDate, isoToday, toStaffDays } from "./day";

const day = (dayNumber: number, playDate: string, isPlayingDay = true): TournamentDay => ({
  id: `day-${dayNumber}`,
  dayNumber,
  playDate,
  label: `Day ${dayNumber}`,
  startTime: "06:30",
  isPlayingDay,
});

const days = toStaffDays([
  day(1, "2026-11-12"),
  day(2, "2026-11-13"),
  day(3, "2026-11-14"),
  day(4, "2026-11-15"),
  day(5, "2026-11-16", false),
]);

describe("staff day", () => {
  it("keeps only the playing days, in day order", () => {
    expect(days.map((entry) => entry.number)).toEqual([1, 2, 3, 4]);
  });

  it("opens on today when the event plays today", () => {
    const choice = chooseDay(days, "2026-11-14");
    expect(choice.reason).toBe("today");
    expect(choice.day?.number).toBe(3);
    expect(dayNotice(choice.reason)).toBeNull();
  });

  it("opens on the next playing day when today is before the event", () => {
    const choice = chooseDay(days, "2026-11-06");
    expect(choice.reason).toBe("next");
    expect(choice.day?.number).toBe(1);
    expect(dayNotice("next")).toMatch(/next playing day/);
  });

  it("skips a rest day between playing days", () => {
    const withRest = toStaffDays([
      day(1, "2026-11-12"),
      day(2, "2026-11-13", false),
      day(3, "2026-11-14"),
    ]);
    expect(chooseDay(withRest, "2026-11-13").day?.number).toBe(3);
  });

  it("falls back to the first day once the event has passed", () => {
    const choice = chooseDay(days, "2026-12-01");
    expect(choice.reason).toBe("first");
    expect(choice.day?.number).toBe(1);
    expect(dayNotice("first")).toMatch(/days have passed/);
  });

  it("has no day when the event has none", () => {
    const choice = chooseDay([], "2026-11-14");
    expect(choice.day).toBeNull();
    expect(choice.reason).toBe("none");
    expect(dayNotice("none")).toMatch(/no playing days/);
  });

  it("reads the club's own date, not UTC", () => {
    // 00:30 on the 14th in the Philippines is still the 13th in UTC.
    expect(isoToday(new Date(2026, 10, 14, 0, 30))).toBe("2026-11-14");
  });

  it("labels a day from its stored date and maps a date back to a day number", () => {
    expect(fmtDayDate("2026-11-14")).toMatch(/14/);
    expect(dayNumberForDate(days, "2026-11-15")).toBe(4);
    expect(dayNumberForDate(days, "2026-11-16")).toBeNull();
  });
});
