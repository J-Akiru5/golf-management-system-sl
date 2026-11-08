import { describe, expect, it } from "vitest";
import {
  teeTimesNeedConfirmation,
  unconfirmedTeeTimeDays,
  withTeeTimeConfirmed,
} from "./tee-time-choices";
import type { DayTeePreference } from "./types";

const days: DayTeePreference[] = [
  {
    day: 2,
    label: "Day 2",
    date: "2026-11-13",
    options: ["6:30 AM", "12:30 PM"],
    needsConfirmation: false,
  },
  {
    day: 4,
    label: "Day 4 (as supplied)",
    date: "2026-11-15",
    options: ["6:30 AM", "11:30PM Tee Off"],
    needsConfirmation: true,
  },
];

describe("teeTimesNeedConfirmation", () => {
  it("is true while any day still needs confirmation", () => {
    expect(teeTimesNeedConfirmation(days)).toBe(true);
  });

  it("is false once every day is confirmed", () => {
    expect(teeTimesNeedConfirmation(days.map((d) => ({ ...d, needsConfirmation: false })))).toBe(
      false,
    );
  });

  it("is false for no days, a null list or an undefined list", () => {
    expect(teeTimesNeedConfirmation([])).toBe(false);
    expect(teeTimesNeedConfirmation(null)).toBe(false);
    expect(teeTimesNeedConfirmation(undefined)).toBe(false);
  });
});

describe("unconfirmedTeeTimeDays", () => {
  it("lists only the days that still need confirmation", () => {
    expect(unconfirmedTeeTimeDays(days).map((d) => d.day)).toEqual([4]);
  });

  it("is empty when nothing needs confirmation", () => {
    expect(unconfirmedTeeTimeDays([{ needsConfirmation: false }])).toEqual([]);
    expect(unconfirmedTeeTimeDays(null)).toEqual([]);
  });
});

describe("withTeeTimeConfirmed", () => {
  it("marks one day confirmed and leaves its text and label as supplied", () => {
    const next = withTeeTimeConfirmed(days, "2026-11-15", true);
    const day4 = next.find((d) => d.day === 4);
    expect(day4?.needsConfirmation).toBe(false);
    expect(day4?.label).toBe("Day 4 (as supplied)");
    expect(day4?.options).toEqual(["6:30 AM", "11:30PM Tee Off"]);
    expect(teeTimesNeedConfirmation(next)).toBe(false);
  });

  it("can put a day back to needing confirmation", () => {
    const confirmed = withTeeTimeConfirmed(days, "2026-11-15", true);
    const back = withTeeTimeConfirmed(confirmed, "2026-11-15", false);
    expect(back.find((d) => d.day === 4)?.needsConfirmation).toBe(true);
  });

  it("does not touch the other days or mutate the input", () => {
    const next = withTeeTimeConfirmed(days, "2026-11-15", true);
    expect(next.find((d) => d.day === 2)).toEqual(days[0]);
    expect(days[1]?.needsConfirmation).toBe(true);
  });

  it("returns the same choices for a date that is not on the list", () => {
    expect(withTeeTimeConfirmed(days, "2030-01-01", true)).toEqual(days);
  });
});
