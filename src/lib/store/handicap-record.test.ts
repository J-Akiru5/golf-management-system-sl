import { describe, expect, it } from "vitest";
import type { HandicapRecord } from "@/lib/data/types";
import { initialState, reducer } from "./state";

const record = (overrides: Partial<HandicapRecord> = {}): HandicapRecord => ({
  id: "rec-manual-1",
  clubId: "demo-club",
  playerId: "p-1",
  index: 12.4,
  effectiveDate: "2026-11-14",
  source: "manual_fix",
  uploadRef: null,
  recordedAt: "2026-11-14T00:00:00.000Z",
  ...overrides,
});

const stateWith = (records: HandicapRecord[]) => ({ ...initialState(), records });

describe("upsertRecord", () => {
  it("adds a record for a date that has none", () => {
    const next = reducer(stateWith([]), { type: "upsertRecord", record: record() });
    expect(next.records).toHaveLength(1);
    expect(next.records[0]?.index).toBe(12.4);
  });

  it("replaces the record on the same date and keeps its id", () => {
    const existing = record({ id: "rec-existing", index: 13.2 });
    const next = reducer(stateWith([existing]), {
      type: "upsertRecord",
      record: record({ id: "rec-from-database", index: 10.7 }),
    });
    expect(next.records).toHaveLength(1);
    expect(next.records[0]?.id).toBe("rec-existing");
    expect(next.records[0]?.index).toBe(10.7);
  });

  it("leaves another player's record and another date alone", () => {
    const otherPlayer = record({ id: "rec-other", playerId: "p-2" });
    const otherDate = record({ id: "rec-older", effectiveDate: "2026-10-01" });
    const next = reducer(stateWith([otherPlayer, otherDate]), {
      type: "upsertRecord",
      record: record(),
    });
    expect(next.records.map((row) => row.id)).toEqual(["rec-other", "rec-older", "rec-manual-1"]);
  });
});
