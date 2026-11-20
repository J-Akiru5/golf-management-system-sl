import { describe, expect, it } from "vitest";
import type { WsPipelineCardRow } from "@/lib/db/types";
import { boardEventFromBroadcast } from "./realtime";

function card(overrides: Partial<WsPipelineCardRow> = {}): WsPipelineCardRow {
  return {
    id: "card-1",
    tournament_id: null,
    title: "Bamboo Tee",
    club_name: "Iloilo Golf and Country Club",
    stage: "live",
    position: 1000,
    start_date: "2026-12-12",
    end_date: "2026-12-13",
    expected_players: 144,
    pricing_model: "per_player",
    quoted_amount: 1250000,
    currency: "PHP",
    owner_id: "user-1",
    notes: null,
    created_by: "user-1",
    created_at: "2026-11-18T09:15:00.000Z",
    updated_at: "2026-11-18T09:15:00.000Z",
    ...overrides,
  };
}

describe("boardEventFromBroadcast", () => {
  it("reads an INSERT from the record", () => {
    const event = boardEventFromBroadcast("INSERT", { record: card() });
    expect(event).toEqual({ kind: "upsert", card: card() });
  });

  it("reads an UPDATE from the new row", () => {
    const event = boardEventFromBroadcast("UPDATE", { new: card({ title: "Renamed" }) });
    expect(event?.kind).toBe("upsert");
    expect(event?.kind === "upsert" ? event.card.title : null).toBe("Renamed");
  });

  it("reads a DELETE from the old record", () => {
    const event = boardEventFromBroadcast("DELETE", { old_record: card() });
    expect(event).toEqual({ kind: "delete", id: "card-1" });
  });

  it("unwraps a payload nested one level", () => {
    const event = boardEventFromBroadcast("INSERT", { payload: { record: card() } });
    expect(event?.kind).toBe("upsert");
  });

  it("ignores an unknown event name", () => {
    expect(boardEventFromBroadcast("TRUNCATE", { record: card() })).toBeNull();
  });

  it("ignores a row with an unknown stage instead of guessing", () => {
    expect(
      boardEventFromBroadcast("UPDATE", { record: card({ stage: "archived" as never }) }),
    ).toBeNull();
  });

  it("ignores a row with a missing id", () => {
    expect(boardEventFromBroadcast("UPDATE", { record: { ...card(), id: 7 } })).toBeNull();
  });

  it("ignores a payload that is not an object", () => {
    expect(boardEventFromBroadcast("INSERT", "nope")).toBeNull();
    expect(boardEventFromBroadcast("DELETE", null)).toBeNull();
  });

  it("ignores a delete with no id", () => {
    expect(boardEventFromBroadcast("DELETE", { old_record: { title: "Gone" } })).toBeNull();
  });
});
