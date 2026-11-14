import { describe, expect, it } from "vitest";
import { mergeScorecardPayloads } from "./merge";

const NOW = Date.UTC(2026, 10, 14, 6, 0, 0);

function card(id: string, name: string, rev: number, holes: string[] = []) {
  return {
    id,
    name,
    rev,
    holes: Array.from({ length: 18 }, (_, index) => holes[index] ?? ""),
  };
}

const cardsOf = (result: { payload: Record<string, unknown> }) =>
  result.payload.cards as { id: string; name: string; rev: number; holes: string[] }[];

describe("mergeScorecardPayloads", () => {
  it("stores the first document as it is", () => {
    const incoming = { cards: [card("a", "ALPHA", 10)] };
    const result = mergeScorecardPayloads(null, incoming, NOW);
    expect(result.changed).toBe(true);
    expect(cardsOf(result)).toHaveLength(1);
  });

  it("keeps a card that only one side has, so user 2's save never erases user 1's card", () => {
    const stored = { cards: [card("a", "ALPHA", 10, ["4"])] };
    const incoming = { cards: [card("b", "BRAVO", 20, ["5"])] };
    const result = mergeScorecardPayloads(stored, incoming, NOW);
    expect(
      cardsOf(result)
        .map((c) => c.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("takes the newer version of a card both sides have", () => {
    const stored = { cards: [card("a", "ALPHA", 30, ["6"])] };
    const older = { cards: [card("a", "ALPHA", 20, ["4"])] };
    expect(cardsOf(mergeScorecardPayloads(stored, older, NOW))[0]?.holes[0]).toBe("6");
    const newer = { cards: [card("a", "ALPHA", 40, ["7"])] };
    expect(cardsOf(mergeScorecardPayloads(stored, newer, NOW))[0]?.holes[0]).toBe("7");
  });

  it("is the same whichever user saves first", () => {
    const user1 = { cards: [card("a", "ALPHA", 20, ["4"]), card("c", "CHARLIE", 5)] };
    const user2 = { cards: [card("a", "ALPHA", 10, ["3"]), card("b", "BRAVO", 25, ["5"])] };
    const one = mergeScorecardPayloads(
      mergeScorecardPayloads(null, user1, NOW).payload,
      user2,
      NOW,
    );
    const two = mergeScorecardPayloads(
      mergeScorecardPayloads(null, user2, NOW).payload,
      user1,
      NOW,
    );
    const view = (r: typeof one) =>
      cardsOf(r)
        .map((c) => `${c.id}:${c.holes[0]}`)
        .join(",");
    expect(view(one)).toBe(view(two));
    expect(view(one)).toBe("a:4,b:5,c:");
  });

  it("lets a removal beat an older card and lose to a later change", () => {
    const stored = { cards: [card("a", "ALPHA", 10)] };
    const removed = {
      cards: [],
      removedCards: [{ id: "a", rev: 20 }],
    };
    const afterRemoval = mergeScorecardPayloads(stored, removed, NOW);
    expect(cardsOf(afterRemoval)).toHaveLength(0);

    // The card is edited again later by someone who had not seen the removal.
    const edited = { cards: [card("a", "ALPHA", 30, ["4"])] };
    const result = mergeScorecardPayloads(afterRemoval.payload, edited, NOW);
    expect(cardsOf(result)).toHaveLength(1);
  });

  it("keeps a removal even when a stale copy is sent again", () => {
    const stored = { cards: [], removedCards: [{ id: "a", rev: 20 }] };
    const stale = { cards: [card("a", "ALPHA", 10)] };
    expect(cardsOf(mergeScorecardPayloads(stored, stale, NOW))).toHaveLength(0);
  });

  it("joins the card lists of a batch two people added to", () => {
    const stored = {
      cards: [],
      reviewBatches: [{ id: "b1", name: "Scan", cardIds: ["a"], createdAt: "t1", rev: 10 }],
    };
    const incoming = {
      cards: [],
      reviewBatches: [{ id: "b1", name: "Scan", cardIds: ["b"], createdAt: "t1", rev: 20 }],
    };
    const batches = mergeScorecardPayloads(stored, incoming, NOW).payload.reviewBatches as {
      cardIds: string[];
    }[];
    expect(batches).toHaveLength(1);
    expect([...(batches[0]?.cardIds ?? [])].sort()).toEqual(["a", "b"]);
  });

  it("removes a batch by tombstone and keeps one created after it", () => {
    const stored = {
      cards: [],
      reviewBatches: [{ id: "b1", name: "Old", cardIds: [], createdAt: "t1", rev: 10 }],
    };
    const removed = { cards: [], removedBatches: [{ id: "b1", rev: 20 }] };
    const merged = mergeScorecardPayloads(stored, removed, NOW);
    expect(merged.payload.reviewBatches).toEqual([]);
  });

  it("takes the page's own view choice, never the stored one", () => {
    const stored = { cards: [], activeReviewBatchId: "b-of-user-1" };
    const incoming = { cards: [], activeReviewBatchId: "all" };
    expect(mergeScorecardPayloads(stored, incoming, NOW).payload.activeReviewBatchId).toBe("all");
  });

  it("follows the newer scoring mode", () => {
    const stored = { cards: [], mode: "whs", modeRev: 50 };
    const olderIncoming = { cards: [], mode: "written", modeRev: 10 };
    expect(mergeScorecardPayloads(stored, olderIncoming, NOW).payload.mode).toBe("whs");
    const newerIncoming = { cards: [], mode: "written", modeRev: 90 };
    expect(mergeScorecardPayloads(stored, newerIncoming, NOW).payload.mode).toBe("written");
  });

  it("reports no change when the same document is saved again, so nothing is rewritten", () => {
    const stored = {
      cards: [card("a", "ALPHA", 10, ["4"])],
      reviewBatches: [],
      savedAt: "2026-11-14T05:00:00.000Z",
    };
    const first = mergeScorecardPayloads(stored, { ...stored }, NOW);
    expect(first.changed).toBe(false);
    expect(first.payload.savedAt).toBe(stored.savedAt);
  });

  it("treats cards from before revisions existed as the oldest, so the stored copy stays", () => {
    const stored = { cards: [card("a", "ALPHA", 0, ["4"])] };
    const legacy = { cards: [card("a", "ALPHA", 0, ["9"])] };
    expect(cardsOf(mergeScorecardPayloads(stored, legacy, NOW))[0]?.holes[0]).toBe("4");
  });

  // A page opened before the deploy sends and receives the same card shape it always did, so the
  // document may only gain fields. These two hold that: a new field travels with its card, and a
  // card from an older page is not given a field it never had.
  it("keeps a card field an older page does not know about", () => {
    const stored = { cards: [{ id: "a", name: "ALPHA", rev: 10, holes: [] }] };
    const incoming = {
      cards: [{ id: "a", name: "ALPHA", rev: 20, holes: [], notInSystem: true }],
    };
    const merged = cardsOf(mergeScorecardPayloads(stored, incoming, NOW))[0] as Record<
      string,
      unknown
    >;
    expect(merged.notInSystem).toBe(true);
  });

  it("accepts a card from an older page without inventing the fields it lacks", () => {
    const stored = {
      cards: [{ id: "a", name: "ALPHA", rev: 10, holes: [], notInSystem: true }],
    };
    const olderPage = { cards: [{ id: "a", name: "ALPHA", rev: 20, holes: ["4"] }] };
    const merged = cardsOf(mergeScorecardPayloads(stored, olderPage, NOW))[0] as Record<
      string,
      unknown
    >;
    expect(merged.holes).toEqual(["4"]);
    expect(merged.notInSystem).toBeUndefined();
  });
});
