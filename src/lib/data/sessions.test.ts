import { describe, expect, it } from "vitest";
import {
  AM_TEE_TIME,
  daySessionBadge,
  daySessionSummary,
  daySessions,
  FINAL_DAY_PM_TEE_TIME,
  PM_TEE_TIME,
  registeredDayBadges,
  sessionForTime,
  sessionForTimeIn,
  sessionLabelForTime,
  sessionSummaryOf,
  sessionsForDay,
} from "./sessions";

describe("daySessions", () => {
  it("gives a Thursday to Saturday a morning and an afternoon", () => {
    expect(daySessions(0, 4)).toEqual([
      { key: "AM", label: "AM", time: AM_TEE_TIME },
      { key: "PM", label: "PM", time: PM_TEE_TIME },
    ]);
  });

  it("gives Sunday two sessions with the later one at 11:30", () => {
    expect(daySessions(3, 4)).toEqual([
      { key: "AM", label: "AM", time: AM_TEE_TIME },
      { key: "PM", label: "PM", time: FINAL_DAY_PM_TEE_TIME },
    ]);
  });

  it("treats a one-day event as its own last day", () => {
    expect(daySessions(0, 1)[1]?.time).toBe(FINAL_DAY_PM_TEE_TIME);
  });
});

describe("sessionForTime", () => {
  it("keeps an early shot in the morning even before the default time", () => {
    expect(sessionForTime("06:10", 0, 4)?.label).toBe("AM");
  });

  it("keeps a late shot in the afternoon after the default time", () => {
    expect(sessionForTime("12:40", 0, 4)?.label).toBe("PM");
  });

  it("reads a late morning shot as the morning", () => {
    expect(sessionForTime("09:30", 0, 4)?.label).toBe("AM");
  });

  it("reads Sunday's 11:30 as the afternoon and Sunday's early start as the morning", () => {
    expect(sessionForTime("11:30", 3, 4)?.label).toBe("PM");
    expect(sessionForTime("07:00", 3, 4)?.label).toBe("AM");
  });

  it("turns over at noon", () => {
    expect(sessionForTime("11:59", 0, 4)?.label).toBe("AM");
    expect(sessionForTime("12:00", 0, 4)?.label).toBe("PM");
    expect(sessionForTime("15:00", 0, 4)?.label).toBe("PM");
  });

  it("keeps the last day's 09:15 in the morning", () => {
    // A morning start can move later on the final day; it is still the morning.
    expect(sessionForTime("09:15", 3, 4)?.label).toBe("AM");
  });

  it("keeps a 10:00 opening in the morning", () => {
    // The desk can move a day's opening time; the label follows the day, not a fixed 06:30.
    expect(sessionForTime("10:00", 0, 4)?.label).toBe("AM");
    expect(sessionForTime("10:00", 3, 4)?.label).toBe("AM");
  });

  it("turns over at Sunday's 11:30 second-session start", () => {
    expect(sessionForTime("11:15", 3, 4)?.label).toBe("AM");
    expect(sessionForTime("11:30", 3, 4)?.label).toBe("PM");
    expect(sessionForTime("11:45", 3, 4)?.label).toBe("PM");
  });

  it("has no session without a readable time", () => {
    expect(sessionForTime(null, 0, 4)).toBeNull();
    expect(sessionForTime("", 0, 4)).toBeNull();
    expect(sessionForTime("half past six", 0, 4)).toBeNull();
    expect(sessionForTime("25:00", 0, 4)).toBeNull();
  });
});

describe("daySessionSummary", () => {
  it("names both sessions of an ordinary day", () => {
    expect(daySessionSummary(1, 4)).toBe("AM 06:30 · PM 12:30");
  });

  it("names Sunday with its 11:30 second session", () => {
    expect(daySessionSummary(3, 4)).toBe("AM 06:30 · PM 11:30");
  });
});

describe("sessionLabelForTime", () => {
  it("returns only the label for a table cell", () => {
    expect(sessionLabelForTime("06:30", 0, 4)).toBe("AM");
    expect(sessionLabelForTime("12:30", 0, 4)).toBe("PM");
    expect(sessionLabelForTime(null, 0, 4)).toBeNull();
  });
});

describe("daySessionBadge", () => {
  it("gives a single-day event the last day's afternoon time", () => {
    expect(daySessionBadge({ dayIndex: 0, dayCount: 1, session: "PM" })).toEqual({
      session: "PM",
      label: "PM",
      time: FINAL_DAY_PM_TEE_TIME,
      source: "chosen",
    });
  });

  it("keeps a two-day event's first afternoon at 12:30 and its last at 11:30", () => {
    expect(daySessionBadge({ dayIndex: 0, dayCount: 2, session: "PM" }).time).toBe(PM_TEE_TIME);
    expect(daySessionBadge({ dayIndex: 1, dayCount: 2, session: "PM" }).time).toBe(
      FINAL_DAY_PM_TEE_TIME,
    );
  });

  it("keeps a four-day event's middle afternoons at 12:30 and the last at 11:30", () => {
    expect(daySessionBadge({ dayIndex: 1, dayCount: 4, session: "PM" }).time).toBe(PM_TEE_TIME);
    expect(daySessionBadge({ dayIndex: 2, dayCount: 4, session: "PM" }).time).toBe(PM_TEE_TIME);
    expect(daySessionBadge({ dayIndex: 3, dayCount: 4, session: "PM" }).time).toBe(
      FINAL_DAY_PM_TEE_TIME,
    );
  });

  it("lets a stored time override the session default", () => {
    expect(
      daySessionBadge({ dayIndex: 1, dayCount: 4, session: "AM", teeTime: "07:15:00" }),
    ).toMatchObject({ session: "AM", time: "07:15", source: "chosen" });
    expect(daySessionBadge({ dayIndex: 1, dayCount: 4, teeTime: "07:15" })).toMatchObject({
      session: "AM",
      time: "07:15",
      source: "stored",
    });
  });

  it("reads a stored time across the noon boundary", () => {
    expect(daySessionBadge({ dayIndex: 0, dayCount: 4, teeTime: "11:59" }).session).toBe("AM");
    expect(daySessionBadge({ dayIndex: 0, dayCount: 4, teeTime: "12:00" }).session).toBe("PM");
  });

  it("keeps the chosen session when a stored time disagrees", () => {
    expect(
      daySessionBadge({ dayIndex: 0, dayCount: 4, session: "AM", teeTime: "12:30" }),
    ).toMatchObject({ session: "AM", time: AM_TEE_TIME, source: "chosen" });
  });

  it("keeps Sunday's 11:30 stored time in the afternoon", () => {
    expect(daySessionBadge({ dayIndex: 3, dayCount: 4, teeTime: "11:30" })).toMatchObject({
      session: "PM",
      time: "11:30",
      source: "stored",
    });
  });

  it("falls back to the day's morning when there is no data", () => {
    expect(daySessionBadge({ dayIndex: 2, dayCount: 4 })).toEqual({
      session: "AM",
      label: "AM",
      time: AM_TEE_TIME,
      source: "default",
    });
  });
});

describe("sessionsForDay", () => {
  it("reads the day's stored morning and afternoon starts", () => {
    expect(sessionsForDay({ startTime: "07:00", pmStartTime: "13:30" })).toEqual([
      { key: "AM", label: "AM", time: "07:00", source: "stored" },
      { key: "PM", label: "PM", time: "13:30", source: "stored" },
    ]);
  });

  it("uses the event's stored afternoon start on the last playing day too", () => {
    // A one-day Saturday event must not borrow the 11:30 Sunday fallback when the club stored 12:30.
    expect(sessionsForDay({}, { eventPmStart: "12:30", finalDay: true })).toEqual([
      { key: "AM", label: "AM", time: AM_TEE_TIME, source: "default" },
      { key: "PM", label: "PM", time: PM_TEE_TIME, source: "stored" },
    ]);
  });

  it("falls back to the fixed times only when nothing is stored, and marks them as defaults", () => {
    expect(sessionsForDay({}, {})).toEqual([
      { key: "AM", label: "AM", time: AM_TEE_TIME, source: "default" },
      { key: "PM", label: "PM", time: PM_TEE_TIME, source: "default" },
    ]);
    expect(sessionsForDay({}, { finalDay: true })[1]).toEqual({
      key: "PM",
      label: "PM",
      time: FINAL_DAY_PM_TEE_TIME,
      source: "default",
    });
  });

  it("keeps a stored time readable when Postgres adds seconds", () => {
    expect(sessionsForDay({ startTime: "07:15:00", pmStartTime: "12:45:00" }).map((s) => s.time)).toEqual([
      "07:15",
      "12:45",
    ]);
  });

  it("ignores an unreadable stored time rather than passing it on", () => {
    expect(sessionsForDay({ startTime: "25:00", pmStartTime: "noon" }, { finalDay: true })).toEqual([
      { key: "AM", label: "AM", time: AM_TEE_TIME, source: "default" },
      { key: "PM", label: "PM", time: FINAL_DAY_PM_TEE_TIME, source: "default" },
    ]);
  });

  it("labels a time against the day's own stored starts", () => {
    const sessions = sessionsForDay({ startTime: "10:00", pmStartTime: "13:30" });
    expect(sessionForTimeIn(sessions, "10:00")?.key).toBe("AM");
    expect(sessionForTimeIn(sessions, "13:30")?.key).toBe("PM");
    expect(sessionSummaryOf(sessions)).toBe("AM 10:00 · PM 13:30");
  });
});

describe("registeredDayBadges", () => {
  const days = [
    { dayNumber: 1, label: "Day 1" },
    { dayNumber: 2, label: "Day 2" },
    { dayNumber: 3, label: "Day 3" },
    { dayNumber: 4, label: "Day 4" },
  ];

  it("lists each selected day in order with its session", () => {
    expect(
      registeredDayBadges(
        {
          selectedDays: [3, 1],
          daySessions: { 3: "PM" },
          dayTee: { 1: { teeTime: "07:00" } },
        },
        days,
      ),
    ).toEqual([
      {
        dayNumber: 1,
        dayLabel: "Day 1",
        session: "AM",
        label: "AM",
        time: "07:00",
        source: "stored",
      },
      {
        dayNumber: 3,
        dayLabel: "Day 3",
        session: "PM",
        label: "PM",
        time: PM_TEE_TIME,
        source: "chosen",
      },
    ]);
  });

  it("uses the last day's 11:30 default for an unset session", () => {
    expect(
      registeredDayBadges({ selectedDays: [4], daySessions: { 4: "PM" } }, days)[0],
    ).toMatchObject({ dayNumber: 4, time: FINAL_DAY_PM_TEE_TIME, source: "chosen" });
  });

  it("leaves out a selected day the event does not list", () => {
    expect(registeredDayBadges({ selectedDays: [1, 9] }, days).map((day) => day.dayNumber)).toEqual(
      [1],
    );
  });

  it("gives a selected day with no data the morning default", () => {
    expect(registeredDayBadges({ selectedDays: [2] }, days)[0]).toMatchObject({
      dayNumber: 2,
      session: "AM",
      time: AM_TEE_TIME,
      source: "default",
    });
  });
});
