import { describe, expect, it } from "vitest";
import { parseDateValue, parseDaySelection } from "./dates";

const days = [
  { dayNumber: 1, playDate: "2026-11-12" },
  { dayNumber: 2, playDate: "2026-11-13" },
  { dayNumber: 3, playDate: "2026-11-14" },
  { dayNumber: 4, playDate: "2026-11-15" },
];

describe("parseDateValue", () => {
  it("reads ISO and slash dates in both orders", () => {
    expect(parseDateValue("2026-11-12", "mdy")).toEqual({ ok: true, value: "2026-11-12" });
    expect(parseDateValue("11/12/2026", "mdy")).toEqual({ ok: true, value: "2026-11-12" });
    expect(parseDateValue("12/11/2026", "dmy")).toEqual({ ok: true, value: "2026-11-12" });
  });

  it("reads month names and Excel serials", () => {
    expect(parseDateValue("Nov 12, 1990", "mdy")).toEqual({ ok: true, value: "1990-11-12" });
    expect(parseDateValue("12 November 1990", "mdy")).toEqual({ ok: true, value: "1990-11-12" });
    expect(parseDateValue(33000, "mdy")).toEqual({ ok: true, value: "1990-05-07" });
  });

  it("refuses an impossible date instead of guessing", () => {
    const result = parseDateValue("2026-02-30", "mdy");
    expect(result.ok).toBe(false);
    expect(result.value).toBeNull();
  });

  it("keeps an empty cell empty", () => {
    expect(parseDateValue("", "mdy")).toEqual({ ok: true, value: null });
  });
});

describe("parseDaySelection", () => {
  it("reads explicit day labels", () => {
    expect(parseDaySelection("Day 1 & 2", days).days).toEqual([1, 2]);
    expect(parseDaySelection("D2, D4", days).days).toEqual([2, 4]);
    expect(parseDaySelection("1st day and 3rd day", days).days).toEqual([1, 3]);
  });

  it("reads month ranges and numeric dates", () => {
    expect(parseDaySelection("Nov 12-14", days).days).toEqual([1, 2, 3]);
    expect(parseDaySelection("11/12/2026 and 11/15/2026", days).days).toEqual([1, 4]);
    expect(parseDaySelection("12-13", days).days).toEqual([1, 2]);
  });

  it("reads all days", () => {
    expect(parseDaySelection("all days", days).days).toEqual([1, 2, 3, 4]);
  });

  it("marks a count-only cell uncertain rather than inventing days", () => {
    const result = parseDaySelection("2 days", days);
    expect(result.days).toEqual([]);
    expect(result.uncertain).toBe(true);
  });

  it("ignores an empty cell", () => {
    expect(parseDaySelection("", days)).toEqual({ days: [], uncertain: false, note: null });
  });
});
