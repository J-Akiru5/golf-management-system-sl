import { describe, expect, it } from "vitest";
import {
  daysBetween,
  freezeIndex,
  frozenOutdated,
  isStale,
  selectIndexForCutOff,
} from "./frozen";
import type { HandicapRecord } from "./types";

// Demo-config numbers only: these are not IGCC's data.

const rec = (id: string, index: number | null, effectiveDate: string): HandicapRecord => ({
  id,
  clubId: "igcc",
  playerId: "p1",
  index,
  effectiveDate,
  source: "demo_seed",
  uploadRef: null,
  recordedAt: "2026-10-20T00:00:00+08:00",
});

const CUT_OFF = "2026-11-01"; // demo cut-off

describe("selectIndexForCutOff", () => {
  it("takes the latest record on or before the cut-off, not the newest overall", () => {
    const records = [
      rec("a", 12.4, "2026-09-15"),
      rec("b", 11.8, "2026-10-15"),
      rec("c", 10.2, "2026-11-20"),
    ];
    const s = selectIndexForCutOff(records, CUT_OFF);
    expect(s.record?.id).toBe("b");
    expect(s.index).toBe(11.8);
    expect(s.newer?.id).toBe("c");
    expect(s.reason).toBeNull();
  });

  it("breaks a same-day tie with the later recorded time", () => {
    const older = { ...rec("a", 15, "2026-10-15"), recordedAt: "2026-10-15T09:00:00+08:00" };
    const newer = { ...rec("b", 14.2, "2026-10-15"), recordedAt: "2026-10-16T09:00:00+08:00" };
    expect(selectIndexForCutOff([older, newer], CUT_OFF).record?.id).toBe("b");
  });

  it("returns nothing usable when the only record is after the cut-off", () => {
    const s = selectIndexForCutOff([rec("a", 12.6, "2026-11-05")], CUT_OFF);
    expect(s.record).toBeNull();
    expect(s.index).toBeNull();
    expect(s.reason).toContain("No record on or before the cut-off");
  });

  it("explains an NH record instead of inventing a number", () => {
    const s = selectIndexForCutOff([rec("a", null, "2026-10-15")], CUT_OFF);
    expect(s.index).toBeNull();
    expect(s.reason).toContain("no handicap (NH)");
  });
});

describe("freeze and staleness", () => {
  it("copies the selection onto the registration", () => {
    const s = selectIndexForCutOff([rec("a", 14.2, "2026-10-15")], CUT_OFF);
    const frozen = freezeIndex(s, "2026-10-20T09:00:00+08:00");
    expect(frozen.index).toBe(14.2);
    expect(frozen.recordId).toBe("a");
    expect(frozen.effectiveDate).toBe("2026-10-15");
  });

  it("flags a record older than the allowance", () => {
    const old = selectIndexForCutOff([rec("a", 21.5, "2026-02-10")], CUT_OFF);
    const fresh = selectIndexForCutOff([rec("b", 21.5, "2026-10-15")], CUT_OFF);
    expect(isStale(old, CUT_OFF, 60)).toBe(true);
    expect(isStale(fresh, CUT_OFF, 60)).toBe(false);
  });

  it("spots a freeze that the newer records have overtaken", () => {
    const frozen = freezeIndex(selectIndexForCutOff([rec("a", 12.4, "2026-09-15")], CUT_OFF), "x");
    const now = selectIndexForCutOff(
      [rec("a", 12.4, "2026-09-15"), rec("b", 11.8, "2026-10-15")],
      CUT_OFF,
    );
    expect(frozenOutdated(frozen, now)).toBe(true);
    expect(frozenOutdated(freezeIndex(now, "x"), now)).toBe(false);
  });

  it("counts whole days between ISO dates", () => {
    expect(daysBetween("2026-11-01", "2026-11-11")).toBe(10);
    expect(daysBetween("2026-10-15", "2026-11-01")).toBe(17);
  });
});
