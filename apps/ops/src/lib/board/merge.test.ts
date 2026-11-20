import { describe, expect, it } from "vitest";
import { mergeCard, removeCard, upsertCard } from "./merge";
import type { BoardCard } from "./repo";

function card(id: string, updatedAt: string, title = "Card"): BoardCard {
  return {
    id,
    tournament_id: null,
    title,
    club_name: "Club",
    stage: "inquiry",
    position: 1000,
    start_date: null,
    end_date: null,
    expected_players: null,
    pricing_model: null,
    quoted_amount: null,
    currency: "PHP",
    owner_id: null,
    notes: null,
    created_by: "user-1",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: updatedAt,
  };
}

const OLD = "2026-11-01T00:00:00.000Z";
const NEW = "2026-11-02T00:00:00.000Z";

describe("mergeCard", () => {
  it("takes the newer row", () => {
    const current = card("a", OLD, "Current");
    const incoming = card("a", NEW, "Incoming");
    expect(mergeCard(current, incoming)).toBe(incoming);
  });

  it("ignores a stale row", () => {
    const current = card("a", NEW, "Current");
    const incoming = card("a", OLD, "Incoming");
    expect(mergeCard(current, incoming)).toBe(current);
  });

  it("ignores an echo with the same timestamp", () => {
    const current = card("a", NEW, "Current");
    const incoming = card("a", NEW, "Echo");
    expect(mergeCard(current, incoming)).toBe(current);
  });

  it("ignores a row with an unreadable timestamp", () => {
    const current = card("a", NEW);
    const incoming = card("a", "not a date");
    expect(mergeCard(current, incoming)).toBe(current);
  });
});

describe("upsertCard", () => {
  it("appends a card that is not on the board yet", () => {
    const cards = [card("a", OLD)];
    const next = upsertCard(cards, card("b", NEW));
    expect(next.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(cards).toHaveLength(1);
  });

  it("replaces an older row", () => {
    const next = upsertCard([card("a", OLD, "Old")], card("a", NEW, "New"));
    expect(next[0]?.title).toBe("New");
  });

  it("returns the same array when nothing changed", () => {
    const cards = [card("a", NEW)];
    expect(upsertCard(cards, card("a", OLD))).toBe(cards);
    expect(upsertCard(cards, card("a", NEW))).toBe(cards);
  });

  it("never drops a local edit that is in flight", () => {
    const cards = [card("a", OLD, "Local edit")];
    const next = upsertCard(cards, card("a", NEW, "Broadcast"), new Set(["a"]));
    expect(next).toBe(cards);
  });
});

describe("removeCard", () => {
  it("removes by id", () => {
    expect(removeCard([card("a", OLD), card("b", OLD)], "a").map((entry) => entry.id)).toEqual([
      "b",
    ]);
  });

  it("returns the same array when the card is absent", () => {
    const cards = [card("a", OLD)];
    expect(removeCard(cards, "b")).toBe(cards);
  });

  it("never drops a local edit that is in flight", () => {
    const cards = [card("a", OLD)];
    expect(removeCard(cards, "a", new Set(["a"]))).toBe(cards);
  });
});
