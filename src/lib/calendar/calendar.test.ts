import { describe, expect, it } from "vitest";
import {
  type CalendarEvent,
  calendarEvent,
  DAY_CELL_EVENT_LIMIT,
  eventsOnDate,
  findCalendarConflicts,
  manilaToday,
  monthCells,
  monthLabel,
  splitDayEvents,
} from "./calendar";

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "event-1",
  name: "Bamboo Tee",
  hostName: "Tesla",
  courseId: "course-1",
  status: "open",
  dates: ["2026-11-12"],
  days: [{ playDate: "2026-11-12", startTime: "06:30", label: "Day 1" }],
  ...overrides,
});

describe("manilaToday", () => {
  it("rolls over at midnight in Manila, not at midnight UTC", () => {
    // 23:59 in Manila on 3 November is still 3 November; one minute later is the 4th.
    expect(manilaToday(new Date("2026-11-03T15:59:00Z"))).toBe("2026-11-03");
    expect(manilaToday(new Date("2026-11-03T16:00:00Z"))).toBe("2026-11-04");
  });

  it("returns the ISO date a month cell carries", () => {
    expect(manilaToday(new Date("2026-11-04T02:30:00Z"))).toBe("2026-11-04");
  });
});

describe("event calendar", () => {
  it("builds a Sunday-first six-week grid", () => {
    const cells = monthCells(2026, 10);
    expect(cells).toHaveLength(42);
    expect(cells[0]?.date).toBe("2026-11-01");
    expect(cells[0]?.inMonth).toBe(true);
    expect(cells.at(-1)?.date).toBe("2026-12-12");
    expect(monthLabel(2026, 10)).toContain("November 2026");
  });

  it("finds an exact same-course overlap and a different-time warning", () => {
    const exact = findCalendarConflicts([event(), event({ id: "event-2", name: "Tesla Open" })]);
    expect(exact).toHaveLength(1);
    expect(exact[0]).toMatchObject({ kind: "exact", date: "2026-11-12" });

    const warning = findCalendarConflicts([
      event(),
      event({
        id: "event-3",
        name: "Afternoon",
        days: [{ playDate: "2026-11-12", startTime: "12:30", label: "Day 1" }],
      }),
    ]);
    expect(warning[0]?.kind).toBe("same-day");
  });

  it("does not conflict across courses", () => {
    expect(
      findCalendarConflicts([event(), event({ id: "event-2", courseId: "course-2" })]),
    ).toEqual([]);
  });

  it("lists only the events on a date", () => {
    expect(
      eventsOnDate(
        [
          event(),
          event({
            id: "event-2",
            dates: ["2026-11-13"],
            days: [{ playDate: "2026-11-13", startTime: null, label: "Day 1" }],
          }),
        ],
        "2026-11-12",
      ),
    ).toHaveLength(1);
  });

  it("derives calendar days from a tournament when structured days are absent", () => {
    const derived = calendarEvent({
      id: "t1",
      clubId: "c1",
      name: "Event",
      hostName: null,
      nameNeedsConfirmation: false,
      courseId: "course-1",
      dates: ["2026-11-12", "2026-11-13"],
      cutOffDate: "2026-11-01",
      scheduleNeedsConfirmation: false,
      courseDataConfirmed: false,
      config: {
        date: "2026-11-12",
        maxIndex: 30,
        allowance: 1,
        flightBasis: "index",
        startFormat: "shotgun",
        holes: 18,
        groupSize: 4,
        minGroupSize: 3,
        firstTeeTime: "06:30",
        intervalMinutes: 10,
        waveGapMinutes: 300,
      },
      categories: [],
      flights: [],
      registration: {
        responseEmail: "",
        sponsorQuestion: "",
        payment: null,
        teeTimes: [],
        shirtSizes: [],
        fields: [],
        instructions: null,
      },
      staleIndexDays: 60,
      state: "draft",
      createdAt: "2026-10-24T00:00:00Z",
    });
    expect(derived.days).toEqual([
      { playDate: "2026-11-12", startTime: "06:30", label: "Day 1" },
      { playDate: "2026-11-13", startTime: null, label: "Day 2" },
    ]);
  });
});

describe("splitDayEvents", () => {
  const many = (count: number): CalendarEvent[] =>
    Array.from({ length: count }, (_, index) => event({ id: `event-${index + 1}` }));

  it("hides the events past the limit and keeps input order", () => {
    const events = many(5);
    const { visible, hidden } = splitDayEvents(events);
    expect(visible).toHaveLength(DAY_CELL_EVENT_LIMIT);
    expect(visible.map((item) => item.id)).toEqual(["event-1", "event-2", "event-3"]);
    expect(hidden.map((item) => item.id)).toEqual(["event-4", "event-5"]);
  });

  it("shows everything when the day has exactly the limit", () => {
    const { visible, hidden } = splitDayEvents(many(DAY_CELL_EVENT_LIMIT));
    expect(visible).toHaveLength(DAY_CELL_EVENT_LIMIT);
    expect(hidden).toEqual([]);
  });

  it("returns empty arrays for a day with no events", () => {
    expect(splitDayEvents([])).toEqual({ visible: [], hidden: [] });
  });

  it("shows nothing when the limit is 0", () => {
    const { visible, hidden } = splitDayEvents(many(2), 0);
    expect(visible).toEqual([]);
    expect(hidden).toHaveLength(2);
  });

  it("treats a negative limit as 0", () => {
    const { visible, hidden } = splitDayEvents(many(2), -5);
    expect(visible).toEqual([]);
    expect(hidden).toHaveLength(2);
  });

  it("does not mutate the input", () => {
    const events = many(4);
    const before = events.map((item) => item.id);
    splitDayEvents(events, 1);
    expect(events.map((item) => item.id)).toEqual(before);
  });
});
