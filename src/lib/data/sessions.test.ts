import { describe, expect, it } from "vitest";
import {
  AM_TEE_TIME,
  daySessionSummary,
  daySessions,
  FINAL_DAY_PM_TEE_TIME,
  PM_TEE_TIME,
  sessionForTime,
  sessionLabelForTime,
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
