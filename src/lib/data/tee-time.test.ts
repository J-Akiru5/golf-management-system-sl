import { describe, expect, it } from "vitest";
import {
  dayStartTimes,
  sessionStartTime,
  startCountForField,
  startTimesFrom,
  teeAssignmentProblem,
} from "./tee-time";

const base = { courseHoles: 18, confirmed: false };

describe("teeAssignmentProblem", () => {
  it("accepts a complete unconfirmed assignment", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: 1 })).toBeNull();
  });

  it("accepts clearing both fields", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: null, startHole: null })).toBeNull();
  });

  it("accepts a start time before the draw has assigned a hole", () => {
    // A shotgun start sends everyone off together; the hole comes from the draw later.
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: null })).toBeNull();
  });

  it("refuses a start hole with no tee time", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: null, startHole: 1 })).toBe("both_or_neither");
  });

  it("refuses a hole outside the course", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: 19 })).toBe("hole_range");
    expect(teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: 0 })).toBe("hole_range");
  });

  it("refuses a confirmed assignment with no fields", () => {
    expect(teeAssignmentProblem({ ...base, teeTime: null, startHole: null, confirmed: true })).toBe(
      "confirmed_needs_both",
    );
  });

  it("refuses a confirmed time with no hole", () => {
    expect(
      teeAssignmentProblem({ ...base, teeTime: "06:30", startHole: null, confirmed: true }),
    ).toBe("confirmed_needs_both");
  });
});

describe("startCountForField", () => {
  it("fills every hole with one group before a second start is needed", () => {
    expect(startCountForField(72, 18, 4)).toBe(1);
    expect(startCountForField(73, 18, 4)).toBe(2);
  });

  it("follows the event's own group size and hole count", () => {
    expect(startCountForField(40, 18, 2)).toBe(2);
    expect(startCountForField(40, 9, 4)).toBe(2);
  });

  it("never reports fewer than one start", () => {
    expect(startCountForField(0, 18, 4)).toBe(1);
    expect(startCountForField(Number.NaN, 0, 0)).toBe(1);
  });

  it("keeps counting past two starts when a session needs them", () => {
    // No wave letters and no two-wave cap: the field gets as many starts as it needs.
    expect(startCountForField(145, 18, 4)).toBe(3);
    expect(startCountForField(384, 18, 4)).toBe(6);
  });
});

describe("startTimesFrom", () => {
  it("puts the second start one interval after the first", () => {
    expect(startTimesFrom("06:30", 15, 2)).toEqual([{ time: "06:30" }, { time: "06:45" }]);
  });

  it("honours the requested count", () => {
    expect(startTimesFrom("07:00", 15, 1)).toEqual([{ time: "07:00" }]);
    expect(startTimesFrom("07:00", 15, 0)).toHaveLength(1);
  });

  it("offers as many starts as the field needs, not a fixed two", () => {
    expect(startTimesFrom("06:30", 15, 6).map((start) => start.time)).toEqual([
      "06:30",
      "06:45",
      "07:00",
      "07:15",
      "07:30",
      "07:45",
    ]);
  });

  it("wraps past midnight rather than producing an invalid time", () => {
    expect(startTimesFrom("23:50", 15, 2)).toEqual([{ time: "23:50" }, { time: "00:05" }]);
  });

  it("treats a nonsense interval as no gap", () => {
    expect(startTimesFrom("06:30", Number.NaN, 2).map((start) => start.time)).toEqual([
      "06:30",
      "06:30",
    ]);
  });
});

describe("dayStartTimes", () => {
  it("starts at the event's first tee when the day has no time of its own", () => {
    expect(dayStartTimes({ startTime: null }, "06:30", 15, 2)).toEqual([
      { time: "06:30" },
      { time: "06:45" },
    ]);
  });

  it("starts at the day's own time and keeps the event's interval", () => {
    expect(dayStartTimes({ startTime: "07:00" }, "06:30", 20, 2)).toEqual([
      { time: "07:00" },
      { time: "07:20" },
    ]);
  });

  it("counts the interval on every day instead of borrowing a session time", () => {
    expect(dayStartTimes({ startTime: null }, "06:30", 60, 3).map((start) => start.time)).toEqual([
      "06:30",
      "07:30",
      "08:30",
    ]);
  });
});

describe("sessionStartTime", () => {
  const base = { day: { startTime: null }, dayCount: 4, firstTeeTime: "06:30" };

  it("opens the morning at the day's own time", () => {
    expect(sessionStartTime({ ...base, session: "AM", dayIndex: 2 })).toBe("06:30");
    expect(
      sessionStartTime({
        ...base,
        session: "AM",
        dayIndex: 1,
        day: { startTime: "07:00" },
      }),
    ).toBe("07:00");
  });

  it("opens the afternoon at the club's own afternoon time", () => {
    expect(sessionStartTime({ ...base, session: "PM", dayIndex: 2 })).toBe("12:30");
    expect(sessionStartTime({ ...base, session: "PM", dayIndex: 3 })).toBe("11:30");
  });

  it("reads a missing session as the morning", () => {
    expect(sessionStartTime({ ...base, session: null, dayIndex: 0 })).toBe("06:30");
  });
});
