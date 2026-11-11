import { describe, expect, it } from "vitest";
import { openingPairingDay, type PairingDayLike } from "./pairing-day";

const days: PairingDayLike[] = [
  { dayNumber: 1, playDate: "2026-11-12" },
  { dayNumber: 2, playDate: "2026-11-13" },
  { dayNumber: 3, playDate: "2026-11-14" },
];

describe("openingPairingDay", () => {
  it("opens on today when the published snapshot has it", () => {
    expect(openingPairingDay(days, "2026-11-13")).toBe(2);
  });

  it("opens on today even when the days are not sorted", () => {
    const unsorted: PairingDayLike[] = [
      { dayNumber: 2, playDate: "2026-11-13" },
      { dayNumber: 1, playDate: "2026-11-12" },
    ];
    expect(openingPairingDay(unsorted, "2026-11-13")).toBe(2);
  });

  it("falls back to the first published day when today is not one of them", () => {
    expect(openingPairingDay(days, "2026-11-10")).toBe(1);
    expect(openingPairingDay(days, "2026-11-16")).toBe(1);
  });

  it("falls back to the first published day when today is unreadable", () => {
    expect(openingPairingDay(days, "not-a-date")).toBe(1);
    expect(openingPairingDay(days, "")).toBe(1);
  });

  it("does not match a day with no readable date", () => {
    const mixed: PairingDayLike[] = [
      { dayNumber: 1, playDate: "" },
      { dayNumber: 2, playDate: "2026-11-13" },
    ];
    expect(openingPairingDay(mixed, "2026-11-14")).toBe(1);
  });

  it("has nothing to open on an empty published list", () => {
    expect(openingPairingDay([], "2026-11-12")).toBeNull();
  });
});
