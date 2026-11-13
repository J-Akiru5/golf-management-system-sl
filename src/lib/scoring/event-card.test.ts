import { describe, expect, it } from "vitest";
import { makeSnapshotFor, TEST_TEE } from "./__tests__/fixtures";
import { type EventCardPlanInput, pickDeskMarker, planEventCardSave } from "./event-card";

const PLAYERS = [
  { playerId: "p3", playerName: "Charlie", handicap: null },
  { playerId: "p1", playerName: "Alpha", handicap: null },
  { playerId: "p2", playerName: "Bravo", handicap: null },
];

function input(overrides: Partial<EventCardPlanInput> = {}): EventCardPlanInput {
  return {
    rulesVersion: "bamboo-tee-2026",
    roundStatus: "scoring",
    requiredCards: 1,
    tee: TEST_TEE,
    effectiveDate: "2026-11-14",
    playerId: "p1",
    cardHandicap: "16.7",
    players: PLAYERS,
    cards: [],
    ...overrides,
  };
}

function refusal(overrides: Partial<EventCardPlanInput>): string {
  const plan = planEventCardSave(input(overrides));
  if (plan.ok) throw new Error("The plan was expected to refuse.");
  return plan.message;
}

describe("planning a card under the event rules", () => {
  it("plans the handicap, the marker and the audit sentence", () => {
    const plan = planEventCardSave(input());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.reading.playingHandicap).toBe(16);
    expect(plan.snapshot.playingHandicap).toBe(16);
    expect(plan.needsSnapshotWrite).toBe(true);
    expect(plan.marker).toEqual({ playerId: "p2", playerName: "Bravo", placeholder: true });
    expect(plan.auditReason).toContain("bamboo-tee-2026");
    expect(plan.auditReason).toContain("16.7");
    expect(plan.auditReason).toContain("plays off 16");
    expect(plan.auditReason).toContain("placeholder");
  });

  it("writes blank in the audit sentence when the box is blank", () => {
    const plan = planEventCardSave(input({ cardHandicap: "  " }));
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.reading.playingHandicap).toBe(0);
    expect(plan.auditReason).toContain("HDCP on card blank, plays off 0");
  });

  it("does not write a snapshot that already plays off the same number", () => {
    const plan = planEventCardSave(
      input({
        players: PLAYERS.map((player) =>
          player.playerId === "p1" ? { ...player, handicap: makeSnapshotFor(16) } : player,
        ),
        // Index 16 on the test tee plays off 17 under WHS, so use the number it really gives.
        cardHandicap: String(makeSnapshotFor(16).playingHandicap),
      }),
    );
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.needsSnapshotWrite).toBe(false);
  });

  it("names the marker the desk chose and does not call it a placeholder", () => {
    const plan = planEventCardSave(input({ scorerId: "p3" }));
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.marker).toEqual({ playerId: "p3", playerName: "Charlie", placeholder: false });
    expect(plan.auditReason).not.toContain("placeholder");
  });

  it("is on the event rules only when the round says so", () => {
    expect(refusal({ rulesVersion: "demo-rules-v1" })).toContain("not on the event's card rules");
    expect(refusal({ rulesVersion: null })).toContain("not set");
  });

  it("refuses a round that is not taking cards", () => {
    expect(refusal({ roundStatus: "draft" })).toContain("not open yet");
    expect(refusal({ roundStatus: "final" })).toContain("final");
  });

  it("refuses a round that needs more cards than the event rule", () => {
    expect(refusal({ requiredCards: 2 })).toContain("needs 2 cards per player");
    expect(refusal({ requiredCards: null })).toContain("unset number");
  });

  it("refuses a handicap it cannot read instead of guessing one", () => {
    expect(refusal({ cardHandicap: "+2.1" })).toContain("Alpha");
    expect(refusal({ cardHandicap: "+2.1" })).toContain("not a plain number");
  });

  it("refuses to change a frozen snapshot that differs from the card", () => {
    const message = refusal({
      players: PLAYERS.map((player) =>
        player.playerId === "p1" ? { ...player, handicap: makeSnapshotFor(30) } : player,
      ),
    });
    expect(message).toContain("frozen once scoring starts");
  });

  it("may change a differing snapshot while the round is still open", () => {
    const plan = planEventCardSave(
      input({
        roundStatus: "open",
        players: PLAYERS.map((player) =>
          player.playerId === "p1" ? { ...player, handicap: makeSnapshotFor(30) } : player,
        ),
      }),
    );
    expect(plan.ok).toBe(true);
  });

  it("refuses a player marking their own card, or a marker outside the round", () => {
    expect(refusal({ scorerId: "p1" })).toContain("own card");
    expect(refusal({ scorerId: "nobody" })).toContain("not a player in this round");
    expect(refusal({ playerId: "nobody" })).toContain("not in this round");
  });

  it("needs a second player to stand as marker", () => {
    const alone = PLAYERS.filter((player) => player.playerId === "p1");
    expect(refusal({ players: alone })).toContain("second player");
  });
});

describe("the desk marker", () => {
  it("is the first other player by id, whatever order the round lists them in", () => {
    expect(pickDeskMarker(PLAYERS, "p1", [])?.playerId).toBe("p2");
    expect(pickDeskMarker([...PLAYERS].reverse(), "p1", [])?.playerId).toBe("p2");
    expect(pickDeskMarker(PLAYERS, "p2", [])?.playerId).toBe("p1");
  });

  it("reuses the marker of a card already in, so a second save never adds a second marker", () => {
    const cards = [{ playerId: "p1", scorerId: "p3", status: "approved" as const, revision: 1 }];
    expect(pickDeskMarker(PLAYERS, "p1", cards)).toEqual({
      playerId: "p3",
      playerName: "Charlie",
      placeholder: false,
    });
  });

  it("ignores a card that was rejected", () => {
    const cards = [{ playerId: "p1", scorerId: "p3", status: "rejected" as const, revision: 1 }];
    expect(pickDeskMarker(PLAYERS, "p1", cards)?.playerId).toBe("p2");
  });
});
