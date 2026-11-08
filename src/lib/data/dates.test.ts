import { describe, expect, it } from "vitest";
import { makeDemoTournaments } from "@/lib/demo/data";
import { addIsoDays, daysOfTournament, nextPlayDay, playingDaysOf, selectedDaysOf } from "./dates";
import type { TournamentDay } from "./types";

describe("addIsoDays", () => {
  it("adds a day inside the same month", () => {
    expect(addIsoDays("2026-10-18", 1)).toBe("2026-10-19");
  });

  it("rolls over a month and a year", () => {
    expect(addIsoDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addIsoDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addIsoDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("returns an unreadable date unchanged rather than inventing one", () => {
    expect(addIsoDays("not-a-date", 1)).toBe("not-a-date");
  });
});

describe("nextPlayDay", () => {
  it("adds the next calendar day after the last one, not a copy of it", () => {
    expect(nextPlayDay(["2026-11-12", "2026-11-13"], "2026-11-12")).toBe("2026-11-14");
    expect(nextPlayDay(["2026-11-30"], "2026-11-30")).toBe("2026-12-01");
  });

  it("uses the event date when the list is empty", () => {
    expect(nextPlayDay([], "2026-11-12")).toBe("2026-11-13");
  });

  it("falls back to tomorrow when even the fallback is unreadable", () => {
    const next = nextPlayDay([], "not-a-date");
    expect(next).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("playingDaysOf", () => {
  const day = (dayNumber: number, playDate: string, isPlayingDay = true): TournamentDay => ({
    id: `d${dayNumber}`,
    dayNumber,
    playDate,
    label: `Day ${dayNumber}`,
    startTime: null,
    isPlayingDay,
  });

  it("drops a trailing non-playing day so the last playing day is still last", () => {
    const days = [
      day(1, "2026-11-05"),
      day(2, "2026-11-06"),
      day(3, "2026-11-07"),
      day(4, "2026-11-08", false),
    ];
    expect(playingDaysOf(days).map((item) => item.dayNumber)).toEqual([1, 2, 3]);
  });

  it("sorts by day number and keeps one row per day number", () => {
    const days = [day(2, "2026-11-06"), day(1, "2026-11-05"), day(1, "2026-11-05")];
    expect(playingDaysOf(days).map((item) => item.dayNumber)).toEqual([1, 2]);
  });
});

describe("daysOfTournament", () => {
  it("derives one structured day per event date when the database has no day rows", () => {
    const tournament = makeDemoTournaments()[0];
    expect(tournament).toBeDefined();
    if (!tournament) return;
    const withoutDays = {
      ...tournament,
      days: undefined,
      registration: { ...tournament.registration, teeTimes: [] },
    };
    const days = daysOfTournament(withoutDays);
    expect(days).toHaveLength(withoutDays.dates.length);
    expect(days[0]?.dayNumber).toBe(1);
    expect(days[0]?.playDate).toBe(withoutDays.dates[0]);
    expect(days[0]?.startTime).toBe(withoutDays.config.firstTeeTime);
    expect(days[1]?.startTime).toBeNull();
  });

  it("uses the saved structured days when they exist", () => {
    const tournament = makeDemoTournaments()[0];
    expect(tournament).toBeDefined();
    if (!tournament) return;
    const days = daysOfTournament({
      ...tournament,
      days: [
        {
          id: "d1",
          dayNumber: 1,
          playDate: "2026-11-12",
          label: "Day 1",
          startTime: "06:30",
          isPlayingDay: true,
        },
      ],
    });
    expect(days).toHaveLength(1);
    expect(days[0]?.id).toBe("d1");
  });

  it("sorts stored days by day number and drops a duplicate number", () => {
    const tournament = makeDemoTournaments()[0];
    expect(tournament).toBeDefined();
    if (!tournament) return;
    const days = daysOfTournament({
      ...tournament,
      days: [
        {
          id: "sunday",
          dayNumber: 4,
          playDate: "2026-11-08",
          label: "Day 4",
          startTime: null,
          isPlayingDay: true,
        },
        {
          id: "thursday",
          dayNumber: 1,
          playDate: "2026-11-05",
          label: "Day 1",
          startTime: "06:30",
          isPlayingDay: true,
        },
        {
          id: "thursday-again",
          dayNumber: 1,
          playDate: "2026-11-05",
          label: "Day 1 again",
          startTime: "07:00",
          isPlayingDay: true,
        },
      ],
    });
    expect(days.map((item) => item.dayNumber)).toEqual([1, 4]);
    expect(days[0]?.id).toBe("thursday");
  });

  it("derives a demo entry's days from its tee preferences, ignoring a null preference", () => {
    const days: TournamentDay[] = [
      {
        id: "d1",
        dayNumber: 1,
        playDate: "2026-11-12",
        label: "Day 1",
        startTime: "06:30",
        isPlayingDay: true,
      },
      {
        id: "d2",
        dayNumber: 2,
        playDate: "2026-11-13",
        label: "Day 2",
        startTime: null,
        isPlayingDay: true,
      },
    ];
    expect(
      selectedDaysOf(
        {
          selectedDays: undefined,
          teePreferences: { "2026-11-12": "6:30 AM", "2026-11-13": null },
        },
        days,
      ),
    ).toEqual([1]);
    expect(
      selectedDaysOf({ selectedDays: [2], teePreferences: { "2026-11-12": "6:30 AM" } }, days),
    ).toEqual([2]);
  });
});
