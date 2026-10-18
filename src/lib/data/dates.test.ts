import { describe, expect, it } from "vitest";
import { addIsoDays, nextPlayDay } from "./dates";

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
