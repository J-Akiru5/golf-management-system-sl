import { describe, expect, it } from "vitest";
import {
  buildCalendarFile,
  calendarDataUrl,
  calendarFileName,
  calendarUid,
  type CalendarStart,
} from "./calendar";

const start: CalendarStart = {
  title: "Bamboo Tee, Day 1",
  date: "2026-11-12",
  time: "06:30",
  location: "Hole 10",
  description: "Flight A. Group 3.",
};

const now = new Date("2026-11-08T22:00:00Z");

describe("calendar file", () => {
  it("writes one Manila event with a four hour block", () => {
    const ics = buildCalendarFile(start, now);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("TZID:Asia/Manila");
    expect(ics).toContain("DTSTART;TZID=Asia/Manila:20261112T063000");
    expect(ics).toContain("DTEND;TZID=Asia/Manila:20261112T103000");
    expect(ics).toContain("SUMMARY:Bamboo Tee\\, Day 1");
    expect(ics).toContain("LOCATION:Hole 10");
    expect(ics).toContain("DTSTAMP:20261108T220000Z");
    expect(ics).toContain("END:VCALENDAR");
    // A real file uses CRLF and ends with one, so Windows and iOS both accept it.
    expect(ics).toContain("\r\n");
  });

  it("rolls the end past midnight without losing a day", () => {
    const ics = buildCalendarFile({ ...start, time: "22:30" }, now);
    expect(ics).toContain("DTEND;TZID=Asia/Manila:20261113T023000");
  });

  it("refuses a date or time it cannot read instead of guessing", () => {
    expect(buildCalendarFile({ ...start, date: "12 Nov" }, now)).toBeNull();
    expect(buildCalendarFile({ ...start, time: "25:00" }, now)).toBeNull();
  });

  it("keeps a stable uid and a readable file name", () => {
    expect(calendarUid(start)).toBe(calendarUid(start));
    expect(calendarUid(start)).toContain("20261112-0630");
    expect(calendarFileName(start)).toBe("bamboo-tee-day-1-2026-11-12.ics");
    expect(calendarFileName({ ...start, title: "!!!", date: "2026-11-12" })).toBe(
      "tee-time-2026-11-12.ics",
    );
  });

  it("percent-encodes the data URL so no character breaks it", () => {
    const url = calendarDataUrl(buildCalendarFile(start, now) ?? "");
    expect(url.startsWith("data:text/calendar;charset=utf-8,")).toBe(true);
    expect(url).not.toContain("\r\n");
    expect(decodeURIComponent(url.split(",")[1] ?? "")).toContain("BEGIN:VEVENT");
  });
});
