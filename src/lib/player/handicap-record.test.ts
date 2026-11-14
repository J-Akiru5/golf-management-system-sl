import { describe, expect, it } from "vitest";
import {
  HANDICAP_INDEX_MAX,
  HANDICAP_INDEX_MIN,
  isIsoDate,
  readHandicapRecordForm,
} from "./handicap-record";

const valid = {
  index: "12.4",
  effectiveDate: "2026-11-14",
  reason: "Corrected from the scorecard",
};

describe("isIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isIsoDate("2026-11-14")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("refuses a shape that looks right but is not a date", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("14/11/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("readHandicapRecordForm", () => {
  it("normalizes a valid entry", () => {
    expect(readHandicapRecordForm(valid)).toEqual({
      ok: true,
      value: {
        index: 12.4,
        effectiveDate: "2026-11-14",
        reason: "Corrected from the scorecard",
      },
    });
  });

  it("accepts both ends of the index range, plus handicaps included", () => {
    for (const index of [HANDICAP_INDEX_MIN, HANDICAP_INDEX_MAX, "-2.3"]) {
      expect(readHandicapRecordForm({ ...valid, index: String(index) }).ok).toBe(true);
    }
  });

  it("refuses an index outside the range", () => {
    const below = readHandicapRecordForm({ ...valid, index: "-10.1" });
    const above = readHandicapRecordForm({ ...valid, index: "54.1" });
    expect(below).toEqual({
      ok: false,
      message: "The handicap index must be a number from -10 to 54.",
    });
    expect(above).toEqual({
      ok: false,
      message: "The handicap index must be a number from -10 to 54.",
    });
  });

  it("refuses a blank, non-numeric or two-decimal index", () => {
    expect(readHandicapRecordForm({ ...valid, index: "  " }).ok).toBe(false);
    expect(readHandicapRecordForm({ ...valid, index: "twelve" }).ok).toBe(false);
    expect(readHandicapRecordForm({ ...valid, index: "12.45" })).toEqual({
      ok: false,
      message: "Use one decimal place for the handicap index.",
    });
  });

  it("refuses a missing or impossible effective date", () => {
    const message = "Choose the effective date as a real date.";
    expect(readHandicapRecordForm({ ...valid, effectiveDate: "" })).toEqual({
      ok: false,
      message,
    });
    expect(readHandicapRecordForm({ ...valid, effectiveDate: "2026-02-30" })).toEqual({
      ok: false,
      message,
    });
  });

  it("refuses a reason that is blank or under three characters after trimming", () => {
    const message = "Enter a reason of at least 3 characters.";
    expect(readHandicapRecordForm({ ...valid, reason: "" })).toEqual({ ok: false, message });
    expect(readHandicapRecordForm({ ...valid, reason: " ok " })).toEqual({
      ok: false,
      message,
    });
  });

  it("trims the reason that is kept", () => {
    const read = readHandicapRecordForm({ ...valid, reason: "  corrected  " });
    expect(read.ok && read.value.reason).toBe("corrected");
  });
});
