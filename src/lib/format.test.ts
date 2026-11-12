import { describe, expect, it } from "vitest";
import { displayName, shortDate } from "./format";

describe("displayName", () => {
  it("shows a player name in capitals and trims the stored spelling", () => {
    expect(displayName("  Carmela Dela Cruz Reyes ")).toBe("CARMELA DELA CRUZ REYES");
    expect(displayName("braga,nonoy")).toBe("BRAGA, NONOY");
    expect(displayName("Tañada, Jose")).toBe("TAÑADA, JOSE");
  });
});

describe("shortDate", () => {
  it("writes a stored day the way people say it", () => {
    expect(shortDate("2026-11-12")).toBe("Thu, Nov 12");
  });

  it("keeps the club's day for a midnight-UTC value", () => {
    expect(shortDate("2026-11-12")).toBe("Thu, Nov 12");
    expect(shortDate("2026-01-01")).toBe("Thu, Jan 1");
  });

  it("returns null for a value that is not an ISO day", () => {
    expect(shortDate(null)).toBeNull();
    expect(shortDate("")).toBeNull();
    expect(shortDate("12 Nov 2026")).toBeNull();
    expect(shortDate("2026-13-99")).toBeNull();
  });
});
