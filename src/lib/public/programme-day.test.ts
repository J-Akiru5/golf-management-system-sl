import { describe, expect, it } from "vitest";
import { openingDayNumber, type ProgrammeDay } from "./programme-day";

const days: ProgrammeDay[] = [
  { dayNumber: 1, playDate: "2026-11-12" },
  { dayNumber: 2, playDate: "2026-11-13" },
  { dayNumber: 3, playDate: "2026-11-14" },
];

describe("openingDayNumber", () => {
  it("opens on today when today is a playing day", () => {
    expect(openingDayNumber(days, "2026-11-13")).toBe(2);
  });

  it("opens on the next upcoming day before the event starts", () => {
    expect(openingDayNumber(days, "2026-11-10")).toBe(1);
    expect(openingDayNumber(days, "2026-11-11")).toBe(1);
  });

  it("skips a rest day", () => {
    const spaced: ProgrammeDay[] = [
      { dayNumber: 1, playDate: "2026-11-12" },
      { dayNumber: 2, playDate: "2026-11-16" },
    ];
    expect(openingDayNumber(spaced, "2026-11-13")).toBe(2);
  });

  it("reads the nearest upcoming date, not the first unsorted entry", () => {
    const unsorted: ProgrammeDay[] = [
      { dayNumber: 2, playDate: "2026-11-13" },
      { dayNumber: 3, playDate: "2026-11-14" },
      { dayNumber: 1, playDate: "2026-11-12" },
    ];
    expect(openingDayNumber(unsorted, "2026-11-11")).toBe(1);
  });

  it("opens on today even when the list is unsorted", () => {
    const unsorted: ProgrammeDay[] = [
      { dayNumber: 2, playDate: "2026-11-13" },
      { dayNumber: 1, playDate: "2026-11-12" },
    ];
    expect(openingDayNumber(unsorted, "2026-11-12")).toBe(1);
  });

  it("falls back to the first day once every day is in the past", () => {
    expect(openingDayNumber(days, "2026-11-20")).toBe(1);
  });

  it("falls back to the first day when today is unreadable", () => {
    expect(openingDayNumber(days, "not-a-date")).toBe(1);
    expect(openingDayNumber(days, "")).toBe(1);
  });

  it("ignores a day with an unreadable date rather than picking it", () => {
    const mixed: ProgrammeDay[] = [
      { dayNumber: 1, playDate: "2026-11-12" },
      { dayNumber: 2, playDate: "" },
      { dayNumber: 3, playDate: "2026-11-14" },
    ];
    expect(openingDayNumber(mixed, "2026-11-13")).toBe(3);
  });

  it("has nothing to open on an empty programme", () => {
    expect(openingDayNumber([], "2026-11-12")).toBeNull();
  });
});
