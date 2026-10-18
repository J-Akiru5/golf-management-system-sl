import { describe, expect, it } from "vitest";
import type { ImportRecord } from "@/lib/ngap";
import { effectiveIndexesFromImport } from "./handicap-records";

const record = (index: number | null, effectiveDate: string): ImportRecord => ({
  row: 1,
  playerId: "player-1",
  name: "Carmela Reyes",
  ngapId: null,
  index,
  effectiveDate,
  matchedBy: "name",
});

describe("effectiveIndexesFromImport", () => {
  it("uses the newest imported record on or before the event cut-off", () => {
    const selected = effectiveIndexesFromImport(
      new Map([["player-1", { index: 18.4, effectiveDate: "2026-09-01" }]]),
      [record(14.2, "2026-10-01"), record(16.1, "2026-08-01")],
      "2026-10-15",
    );
    expect(selected.get("player-1")).toEqual({ index: 14.2, effectiveDate: "2026-10-01" });
  });

  it("does not let an older import replace newer stored history", () => {
    const selected = effectiveIndexesFromImport(
      new Map([["player-1", { index: 13.6, effectiveDate: "2026-10-01" }]]),
      [record(18.4, "2026-09-01")],
      "2026-10-15",
    );
    expect(selected.get("player-1")).toEqual({ index: 13.6, effectiveDate: "2026-10-01" });
  });

  it("honors an NH row at the cut-off without inventing a numeric history record", () => {
    const selected = effectiveIndexesFromImport(
      new Map([["player-1", { index: 13.6, effectiveDate: "2026-09-01" }]]),
      [record(null, "2026-10-01")],
      "2026-10-15",
    );
    expect(selected.get("player-1")).toEqual({ index: null, effectiveDate: "2026-10-01" });
  });

  it("ignores imports after the event cut-off", () => {
    const selected = effectiveIndexesFromImport(
      new Map(),
      [record(14.2, "2026-10-16")],
      "2026-10-15",
    );
    expect(selected.size).toBe(0);
  });
});
