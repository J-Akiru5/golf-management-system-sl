import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateRange,
  formatMoney,
  formatMonth,
  formatPlayers,
  parseIsoDate,
  pricingLabel,
} from "./format";

describe("parseIsoDate", () => {
  it("reads a date column as UTC midnight", () => {
    const date = parseIsoDate("2026-12-12");
    expect(date?.toISOString()).toBe("2026-12-12T00:00:00.000Z");
  });

  it("rejects a missing, malformed or impossible date instead of guessing", () => {
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("12/12/2026")).toBeNull();
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats in UTC so the server and the browser agree", () => {
    expect(formatDate("2026-12-12")).toBe("12 Dec 2026");
  });

  it("returns null for no date", () => {
    expect(formatDate(null)).toBeNull();
  });
});

describe("formatDateRange", () => {
  it("says when there is no date", () => {
    expect(formatDateRange(null, null)).toBe("No date");
  });

  it("shows one date when only the start is set", () => {
    expect(formatDateRange("2026-12-12", null)).toBe("12 Dec 2026");
  });

  it("shows an end-only range plainly", () => {
    expect(formatDateRange(null, "2026-12-12")).toBe("Until 12 Dec 2026");
  });

  it("shows one date when both ends match", () => {
    expect(formatDateRange("2026-12-12", "2026-12-12")).toBe("12 Dec 2026");
  });

  it("shortens a range inside one month", () => {
    expect(formatDateRange("2026-12-12", "2026-12-14")).toBe("12 to 14 Dec 2026");
  });

  it("shows both months when the range crosses one", () => {
    expect(formatDateRange("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 to 3 Jan 2027");
  });
});

describe("formatMonth", () => {
  it("turns a month key into a heading", () => {
    expect(formatMonth("2026-12")).toBe("December 2026");
  });
});

describe("formatMoney", () => {
  it("uses the row's own currency", () => {
    expect(formatMoney(1250000, "PHP")).toContain("1,250,000");
    expect(formatMoney(1250000, "USD")).toContain("1,250,000");
  });

  it("falls back to the number and the code for a currency Intl rejects", () => {
    expect(formatMoney(10, "PESO")).toBe("10.00 PESO");
  });
});

describe("formatPlayers", () => {
  it("counts players in plain words", () => {
    expect(formatPlayers(0)).toBe("0 players");
    expect(formatPlayers(1)).toBe("1 player");
    expect(formatPlayers(144)).toBe("144 players");
  });

  it("returns null for a missing count", () => {
    expect(formatPlayers(null)).toBeNull();
    expect(formatPlayers(undefined)).toBeNull();
  });
});

describe("pricingLabel", () => {
  it("uses the shared labels", () => {
    expect(pricingLabel("per_player")).toBe("Per player");
    expect(pricingLabel("annual")).toBe("Annual");
    expect(pricingLabel(null)).toBeNull();
  });
});
