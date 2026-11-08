import { describe, expect, it } from "vitest";
import { sessionFinderFor } from "./day-sessions";

const days = [
  { dayNumber: 1, isPlayingDay: true },
  { dayNumber: 2, isPlayingDay: true },
  { dayNumber: 3, isPlayingDay: true },
  { dayNumber: 4, isPlayingDay: true },
];

describe("sessionFinderFor", () => {
  it("reads 6:30 as the morning and 12:30 as the afternoon on Saturday", () => {
    const find = sessionFinderFor(days, 3);
    expect(find("06:30")).toBe("AM");
    expect(find("06:45")).toBe("AM");
    expect(find("12:30")).toBe("PM");
    expect(find("12:45")).toBe("PM");
  });

  it("reads 11:30 as the afternoon on the last day, and as the morning on other days", () => {
    expect(sessionFinderFor(days, 4)("11:30")).toBe("PM");
    expect(sessionFinderFor(days, 3)("11:30")).toBe("AM");
  });

  it("uses the first playing day when no day is chosen", () => {
    const find = sessionFinderFor(days, null);
    expect(find("06:30")).toBe("AM");
    expect(find("12:30")).toBe("PM");
  });

  it("ignores a day that is not a playing day and copes with an empty list", () => {
    const find = sessionFinderFor([{ dayNumber: 5, isPlayingDay: false }], 5);
    expect(find("06:30")).toBe("AM");
    expect(sessionFinderFor([], null)("12:30")).toBe("PM");
  });

  it("answers null for a time it cannot read", () => {
    expect(sessionFinderFor(days, 1)("soon")).toBeNull();
  });
});
