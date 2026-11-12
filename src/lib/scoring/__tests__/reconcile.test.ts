import { describe, expect, it } from "vitest";
import { deriveCanonicalHoleScores } from "../reconcile";
import type { CanonicalRound, CardEntry, Resolution, Scorecard } from "../types";
import { DEFAULT_VERIFICATION_POLICY } from "../validation";
import { makeCard, parEntries, TEST_COURSE, TEST_POLICY } from "./fixtures";

function withHole(card: Scorecard, hole: number, patch: Partial<CardEntry>): Scorecard {
  return {
    ...card,
    entries: card.entries.map((entry) => (entry.hole === hole ? { ...entry, ...patch } : entry)),
  };
}

function canonical(cards: Scorecard[], resolutions: Resolution[] = [], policy = TEST_POLICY) {
  return deriveCanonicalHoleScores({
    roundId: "round-1",
    playerId: "player-1",
    course: TEST_COURSE,
    cards,
    resolutions,
    policy,
  });
}

function at(round: CanonicalRound, hole: number) {
  return round.holes.find((candidate) => candidate.hole === hole);
}

describe("multi-card reconciliation", () => {
  it("verifies a hole when the configured number of independent cards agree", () => {
    const result = canonical([
      makeCard({ id: "card-a", scorerId: "scorer-a" }),
      makeCard({ id: "card-b", scorerId: "scorer-b" }),
    ]);

    expect(result.counts).toEqual({ verified: 18, provisional: 0, conflict: 0, pending: 0 });
    expect(result.complete).toBe(true);
    expect(at(result, 1)).toMatchObject({
      status: "verified",
      strokes: 4,
      provenance: "agreement",
      evidenceCardIds: ["card-a", "card-b"],
    });
  });

  it("marks a single card provisional when two are required", () => {
    const result = canonical([makeCard({ id: "card-a", scorerId: "scorer-a" })]);

    expect(result.counts).toEqual({ verified: 0, provisional: 18, conflict: 0, pending: 0 });
    expect(result.complete).toBe(false);
    expect(at(result, 1)?.note).toContain("Requires 2 independent cards");
  });

  it("hides a single card when provisional single-card display is off", () => {
    const result = canonical([makeCard({ id: "card-a", scorerId: "scorer-a" })], [], {
      ...TEST_POLICY,
      allowProvisionalSingleCard: false,
    });

    expect(result.counts).toEqual({ verified: 0, provisional: 0, conflict: 0, pending: 18 });
    expect(result.complete).toBe(false);
  });

  it("never verifies a hole while the card count is unconfirmed", () => {
    const result = canonical(
      [
        makeCard({ id: "card-a", scorerId: "scorer-a" }),
        makeCard({ id: "card-b", scorerId: "scorer-b" }),
      ],
      [],
      { ...TEST_POLICY, requiredCards: null },
    );

    expect(result.counts.verified).toBe(0);
    expect(result.counts.provisional).toBe(18);
    expect(result.complete).toBe(false);
    expect(at(result, 1)?.note).toContain("not confirmed");
  });

  it("flags a disagreement and never picks a value", () => {
    const result = canonical([
      makeCard({ id: "card-a", scorerId: "scorer-a" }),
      makeCard({
        id: "card-b",
        scorerId: "scorer-b",
        writtenTotal: 73,
        entries: parEntries().map((entry) => (entry.hole === 5 ? { ...entry, strokes: 5 } : entry)),
      }),
    ]);

    expect(at(result, 5)).toMatchObject({
      status: "conflict",
      strokes: null,
      provenance: null,
      evidenceCardIds: ["card-a", "card-b"],
    });
    expect(result.counts).toEqual({ verified: 17, provisional: 0, conflict: 1, pending: 0 });
    expect(result.complete).toBe(false);
  });

  it("makes the desk resolution canonical and keeps the evidence intact", () => {
    const cardA = makeCard({ id: "card-a", scorerId: "scorer-a" });
    const cardB = makeCard({
      id: "card-b",
      scorerId: "scorer-b",
      writtenTotal: 73,
      entries: parEntries().map((entry) => (entry.hole === 5 ? { ...entry, strokes: 5 } : entry)),
    });
    const before = JSON.stringify({ cardA, cardB });

    const resolution: Resolution = {
      id: "res-1",
      roundId: "round-1",
      playerId: "player-1",
      hole: 5,
      strokes: 4,
      resolvedBy: "desk-anna",
      resolvedAt: "2026-11-14T10:00:00.000Z",
      reason: "Both scorers checked the card with the player and agreed on 4.",
      evidenceCardIds: ["card-a", "card-b"],
      previousStrokes: null,
    };

    const result = canonical([cardA, cardB], [resolution]);

    expect(at(result, 5)).toMatchObject({
      status: "verified",
      strokes: 4,
      provenance: "desk_resolution",
      evidenceCardIds: ["card-a", "card-b"],
    });
    expect(at(result, 5)?.note).toContain("desk-anna");
    expect(at(result, 5)?.note).toContain(resolution.reason);
    expect(result.complete).toBe(true);
    expect(JSON.stringify({ cardA, cardB })).toBe(before);
  });

  it("uses the latest resolution for a hole", () => {
    const cards = [
      makeCard({ id: "card-a", scorerId: "scorer-a" }),
      makeCard({
        id: "card-b",
        scorerId: "scorer-b",
        writtenTotal: 73,
        entries: parEntries().map((entry) => (entry.hole === 5 ? { ...entry, strokes: 5 } : entry)),
      }),
    ];
    const base: Omit<Resolution, "id" | "strokes" | "resolvedAt"> = {
      roundId: "round-1",
      playerId: "player-1",
      hole: 5,
      resolvedBy: "desk-anna",
      reason: "Checked against the paper card.",
      evidenceCardIds: ["card-a", "card-b"],
      previousStrokes: null,
    };

    const result = canonical(cards, [
      { ...base, id: "res-1", strokes: 4, resolvedAt: "2026-11-14T10:00:00.000Z" },
      { ...base, id: "res-2", strokes: 5, resolvedAt: "2026-11-14T11:00:00.000Z" },
    ]);

    expect(at(result, 5)?.strokes).toBe(5);
  });

  it("ignores a resolution without a reason and leaves the conflict open", () => {
    const cards = [
      makeCard({ id: "card-a", scorerId: "scorer-a" }),
      makeCard({
        id: "card-b",
        scorerId: "scorer-b",
        writtenTotal: 73,
        entries: parEntries().map((entry) => (entry.hole === 5 ? { ...entry, strokes: 5 } : entry)),
      }),
    ];
    const result = canonical(cards, [
      {
        id: "res-1",
        roundId: "round-1",
        playerId: "player-1",
        hole: 5,
        strokes: 4,
        resolvedBy: "desk-anna",
        resolvedAt: "2026-11-14T10:00:00.000Z",
        reason: "",
        evidenceCardIds: [],
        previousStrokes: null,
      },
    ]);

    expect(at(result, 5)?.status).toBe("conflict");
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_resolution", hole: 5 })]),
    );
  });

  it("does not use an unconfirmed low-confidence value as evidence", () => {
    const cardA = withHole(makeCard({ id: "card-a", scorerId: "scorer-a" }), 6, {
      confidence: 0.4,
      manuallyConfirmed: false,
    });
    const cardB = makeCard({ id: "card-b", scorerId: "scorer-b" });

    const result = canonical([cardA, cardB]);

    expect(at(result, 6)).toMatchObject({ status: "provisional", strokes: 4 });
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "low_confidence_entry", hole: 6 })]),
    );
  });

  it("uses a low-confidence value after a person confirms it", () => {
    const cardA = withHole(makeCard({ id: "card-a", scorerId: "scorer-a" }), 6, {
      confidence: 0.4,
      manuallyConfirmed: true,
    });
    const cardB = makeCard({ id: "card-b", scorerId: "scorer-b" });

    const result = canonical([cardA, cardB]);
    expect(at(result, 6)).toMatchObject({ status: "verified", strokes: 4 });
  });

  it("drops a card the player marked themself", () => {
    const result = canonical([
      makeCard({ id: "card-a", scorerId: "player-1" }),
      makeCard({ id: "card-b", scorerId: "scorer-b" }),
    ]);

    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "self_scored_card" })]),
    );
    expect(result.counts.verified).toBe(0);
    expect(result.counts.provisional).toBe(18);
    expect(at(result, 1)?.evidenceCardIds).toEqual(["card-b"]);
  });

  it("drops a scorer's whole evidence set when two cards claim the same revision", () => {
    const result = canonical([
      makeCard({ id: "card-a", scorerId: "scorer-a", revision: 1 }),
      makeCard({ id: "card-a-copy", scorerId: "scorer-a", revision: 1 }),
    ]);

    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "duplicate_card_revision" })]),
    );
    expect(result.counts.verified).toBe(0);
    expect(result.counts.provisional).toBe(0);
    expect(result.counts.pending).toBe(18);
  });

  it("uses the latest revision from the same scorer", () => {
    const result = canonical([
      makeCard({ id: "card-a-1", scorerId: "scorer-a", revision: 1 }),
      makeCard({
        id: "card-a-2",
        scorerId: "scorer-a",
        revision: 2,
        writtenTotal: 73,
        entries: parEntries().map((entry) => (entry.hole === 5 ? { ...entry, strokes: 5 } : entry)),
      }),
      makeCard({ id: "card-b", scorerId: "scorer-b" }),
    ]);

    expect(at(result, 5)).toMatchObject({
      status: "conflict",
      evidenceCardIds: ["card-a-2", "card-b"],
    });
  });

  it("reports cards from another round or another player", () => {
    const result = canonical([
      makeCard({ id: "card-a", scorerId: "scorer-a" }),
      makeCard({ id: "card-wrong-round", scorerId: "scorer-b", roundId: "round-2" }),
      makeCard({ id: "card-wrong-player", scorerId: "scorer-c", playerId: "player-2" }),
    ]);

    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "wrong_round_card" }),
        expect.objectContaining({ code: "wrong_player_card" }),
      ]),
    );
    expect(result.counts.provisional).toBe(18);
  });

  it("reports when no card has been approved yet", () => {
    const result = canonical([
      makeCard({ id: "card-a", scorerId: "scorer-a", status: "submitted" }),
      makeCard({ id: "card-b", scorerId: "scorer-b", status: "rejected" }),
    ]);

    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "no_approved_cards" })]),
    );
    expect(result.counts.pending).toBe(18);
    expect(result.complete).toBe(false);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const cards = [
      makeCard({ id: "card-a", scorerId: "scorer-a" }),
      makeCard({ id: "card-b", scorerId: "scorer-b" }),
    ];
    const before = JSON.stringify(cards);

    const first = canonical(cards);
    const second = canonical(cards);

    expect(second).toEqual(first);
    expect(JSON.stringify(cards)).toBe(before);
  });

  it("publishes nothing under the unconfirmed default policy", () => {
    const result = canonical(
      [
        makeCard({ id: "card-a", scorerId: "scorer-a" }),
        makeCard({ id: "card-b", scorerId: "scorer-b" }),
      ],
      [],
      DEFAULT_VERIFICATION_POLICY,
    );

    expect(result.counts).toEqual({ verified: 0, provisional: 0, conflict: 0, pending: 18 });
    expect(result.complete).toBe(false);
  });

  it("fails closed when the verification policy is invalid", () => {
    const result = canonical(
      [
        makeCard({ id: "card-a", scorerId: "scorer-a" }),
        makeCard({ id: "card-b", scorerId: "scorer-b" }),
      ],
      [],
      { ...TEST_POLICY, requiredCards: 0 },
    );

    expect(result.holes).toEqual([]);
    expect(result.counts).toEqual({ verified: 0, provisional: 0, conflict: 0, pending: 0 });
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_policy" })]),
    );
  });

  it("verifies a hole when both cards report a pick-up", () => {
    const cards = [
      withHole(makeCard({ id: "card-a", scorerId: "scorer-a" }), 5, {
        strokes: null,
        pickedUp: true,
      }),
      withHole(makeCard({ id: "card-b", scorerId: "scorer-b" }), 5, {
        strokes: null,
        pickedUp: true,
      }),
    ];

    const result = canonical(cards);

    expect(at(result, 5)).toMatchObject({
      status: "verified",
      strokes: null,
      pickedUp: true,
      provenance: "agreement",
      evidenceCardIds: ["card-a", "card-b"],
    });
    expect(result.counts.verified).toBe(18);
    expect(result.complete).toBe(true);
  });

  it("flags a number against a pick-up as a conflict", () => {
    const cards = [
      makeCard({ id: "card-a", scorerId: "scorer-a" }),
      withHole(makeCard({ id: "card-b", scorerId: "scorer-b" }), 5, {
        strokes: null,
        pickedUp: true,
      }),
    ];

    const result = canonical(cards);
    const hole = at(result, 5);

    expect(hole).toMatchObject({
      status: "conflict",
      strokes: null,
      provenance: null,
      evidenceCardIds: ["card-a", "card-b"],
    });
    expect(hole?.note).toContain("pick-up");
    expect(hole?.note).toContain("4 on card-a");
    expect(result.counts).toEqual({ verified: 17, provisional: 0, conflict: 1, pending: 0 });
  });

  it("settles a hole as a pick-up when the desk resolves it that way", () => {
    const cards = [
      makeCard({ id: "card-a", scorerId: "scorer-a" }),
      withHole(makeCard({ id: "card-b", scorerId: "scorer-b" }), 5, {
        strokes: null,
        pickedUp: true,
      }),
    ];
    const resolution: Resolution = {
      id: "res-1",
      roundId: "round-1",
      playerId: "player-1",
      hole: 5,
      strokes: 0,
      pickedUp: true,
      resolvedBy: "desk-anna",
      resolvedAt: "2026-11-14T10:00:00.000Z",
      reason: "The marker confirmed the player picked up.",
      evidenceCardIds: ["card-a", "card-b"],
      previousStrokes: null,
    };

    const result = canonical(cards, [resolution]);

    expect(at(result, 5)).toMatchObject({
      status: "verified",
      strokes: null,
      pickedUp: true,
      provenance: "desk_resolution",
      evidenceCardIds: ["card-a", "card-b"],
    });
    expect(result.complete).toBe(true);
  });

  it("ignores a pick-up resolution that carries a real stroke count", () => {
    const cards = [
      makeCard({ id: "card-a", scorerId: "scorer-a" }),
      withHole(makeCard({ id: "card-b", scorerId: "scorer-b" }), 5, {
        strokes: null,
        pickedUp: true,
      }),
    ];
    const resolution: Resolution = {
      id: "res-1",
      roundId: "round-1",
      playerId: "player-1",
      hole: 5,
      strokes: 4,
      pickedUp: true,
      resolvedBy: "desk-anna",
      resolvedAt: "2026-11-14T10:00:00.000Z",
      reason: "Checked with the player.",
      evidenceCardIds: ["card-a", "card-b"],
      previousStrokes: null,
    };

    const result = canonical(cards, [resolution]);

    expect(at(result, 5)?.status).toBe("conflict");
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_resolution", hole: 5 })]),
    );
  });

  it("fails closed when the course belongs to another round", () => {
    const result = deriveCanonicalHoleScores({
      roundId: "round-2",
      playerId: "player-1",
      course: TEST_COURSE,
      cards: [makeCard({ id: "card-a", scorerId: "scorer-a" })],
      policy: TEST_POLICY,
    });

    expect(result.holes).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_course" })]),
    );
  });
});
