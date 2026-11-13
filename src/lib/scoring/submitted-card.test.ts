import { describe, expect, it } from "vitest";
import { findSubmittedCard } from "./submitted-card";
import type { Scorecard } from "./types";

function card(overrides: Partial<Scorecard> = {}): Scorecard {
  return {
    id: "card-1",
    roundId: "round-1",
    playerId: "p1",
    scorerId: "p2",
    source: "manual",
    revision: 1,
    status: "submitted",
    entries: [],
    writtenTotal: 72,
    submittedAt: "2026-11-13T00:00:00.000Z",
    ...overrides,
  };
}

const match = { playerId: "p1", scorerId: "p2", knownIds: new Set<string>() };

describe("findSubmittedCard", () => {
  it("finds the card a submit just wrote", () => {
    const found = findSubmittedCard([card({ id: "new", revision: 1 })], match);

    expect(found?.id).toBe("new");
  });

  it("finds a correction rather than the older revision", () => {
    const found = findSubmittedCard(
      [card({ id: "old", revision: 1 }), card({ id: "new", revision: 2 })],
      { ...match, knownIds: new Set(["old"]) },
    );

    expect(found?.id).toBe("new");
    expect(found?.revision).toBe(2);
  });

  it("skips an older submitted card with a known id when a new one exists", () => {
    const found = findSubmittedCard(
      [card({ id: "old", revision: 1 }), card({ id: "new", revision: 2 })],
      { ...match, knownIds: new Set(["old", "new"]) },
    );

    expect(found?.id).toBe("new");
  });

  it("falls back to the newest card when every id was already on screen", () => {
    const found = findSubmittedCard(
      [card({ id: "old", revision: 1 }), card({ id: "older", revision: 2 })],
      { ...match, knownIds: new Set(["old", "older"]) },
    );

    expect(found?.id).toBe("older");
  });

  it("returns null when nothing matches", () => {
    expect(findSubmittedCard([], match)).toBeNull();
  });

  it("never returns another player's card", () => {
    const found = findSubmittedCard([card({ id: "theirs", playerId: "p9" })], match);

    expect(found).toBeNull();
  });

  it("never returns a card marked by another player", () => {
    const found = findSubmittedCard([card({ id: "theirs", scorerId: "p9" })], match);

    expect(found).toBeNull();
  });

  it("never returns an approved or rejected card", () => {
    const cards = [
      card({ id: "approved", status: "approved" }),
      card({ id: "rejected", status: "rejected" }),
    ];

    expect(findSubmittedCard(cards, match)).toBeNull();
  });
});
