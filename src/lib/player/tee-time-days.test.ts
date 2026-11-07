import { describe, expect, it } from "vitest";
import { teeDays } from "./tee-time";

const base = {
  dates: ["2026-11-12", "2026-11-13"],
  eventDate: "2026-11-12",
  startFormat: "two_tee" as const,
  flight: "Flight A",
};

describe("teeDays with one published start per playing day", () => {
  it("gives each day chip its own time and hole", () => {
    const days = teeDays(
      {
        ...base,
        start: { dayNumber: 1, hole: 1, wave: null, time: "06:30" },
        starts: [
          { dayNumber: 1, hole: 1, wave: null, time: "06:30" },
          { dayNumber: 2, hole: 10, wave: null, time: "12:40" },
        ],
      },
      "2026-11-12",
    );
    expect(days.map((day) => [day.hasStart, day.time, day.hole])).toEqual([
      [true, "06:30", 1],
      [true, "12:40", 10],
    ]);
    expect(days[1]?.session).toBe("PM");
  });

  it("leaves a day without a start unmarked", () => {
    const days = teeDays(
      {
        ...base,
        start: { dayNumber: 1, hole: 1, wave: null, time: "06:30" },
        starts: [{ dayNumber: 1, hole: 1, wave: null, time: "06:30" }],
      },
      "2026-11-12",
    );
    expect(days[1]?.hasStart).toBe(false);
    expect(days[1]?.time).toBeNull();
  });

  it("keeps the single-start behaviour for an older snapshot", () => {
    const days = teeDays(
      { ...base, start: { dayNumber: 1, hole: 1, wave: null, time: "06:30" }, starts: [] },
      "2026-11-12",
    );
    expect(days.filter((day) => day.hasStart)).toHaveLength(1);
  });
});
