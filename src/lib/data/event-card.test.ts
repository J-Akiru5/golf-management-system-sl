import { describe, expect, it } from "vitest";
import type { CardEntry } from "@/lib/scoring";
import { makeSnapshotFor, TEST_COURSE } from "@/lib/scoring/__tests__/fixtures";
import type { SaveEventCardInput } from "./event-card";
import { createDemoScoringRepository, type ScoringRoundSeed } from "./scoring";

/**
 * The hand calculation, written out so the result row can be checked by eye.
 *
 * The test course (see the fixtures) is:
 *   hole          1  2  3  4  5  6  7  8  9 | 10 11 12 13 14 15 16 17 18
 *   par           4  4  3  5  4  4  3  5  4 |  4  4  3  5  4  4  3  5  4
 *   stroke index  9  3 15  1 11  7 17  5 13 | 10  4 16  2 12  8 18  6 14
 *
 * The HDCP box reads 16.7, so the playing handicap is 16: one stroke on every hole of stroke index
 * 1 to 16, none on stroke index 17 (hole 7) and 18 (hole 16).
 *
 * Gross card (X is a pick-up):
 *   H1 5, H2 4, H3 3, H4 4, H5 4, H6 4, H7 X, H8 5, H9 7,
 *   H10 4, H11 4, H12 3, H13 5, H14 4, H15 4, H16 4, H17 5, H18 4
 *
 * Net points, par 2 / birdie 3 / bogey 1 / worse 0, after the stroke on each hole:
 *   H1 net 4 on par 4 = 2     H10 net 3 on par 4 = 3
 *   H2 net 3 on par 4 = 3     H11 net 3 on par 4 = 3
 *   H3 net 2 on par 3 = 3     H12 net 2 on par 3 = 3
 *   H4 net 3 on par 5 = 4     H13 net 4 on par 5 = 3
 *   H5 net 3 on par 4 = 3     H14 net 3 on par 4 = 3
 *   H6 net 3 on par 4 = 3     H15 net 3 on par 4 = 3
 *   H7 pick-up        = 0     H16 net 4 on par 3 = 1 (no stroke)
 *   H8 net 4 on par 5 = 3     H17 net 4 on par 5 = 3
 *   H9 net 6 on par 4 = 0     H18 net 3 on par 4 = 3
 *   OUT 21                    IN 25            net Stableford 46
 * Gross Stableford is 31, the strokes taken are 73 and there is one pick-up.
 */
const HAND_CARD = [
  "5",
  "4",
  "3",
  "4",
  "4",
  "4",
  "X",
  "5",
  "7",
  "4",
  "4",
  "3",
  "5",
  "4",
  "4",
  "4",
  "5",
  "4",
];

function entriesFrom(cells: readonly string[]): CardEntry[] {
  return cells.map((cell, index) =>
    cell.toUpperCase() === "X"
      ? {
          hole: index + 1,
          strokes: null,
          pickedUp: true,
          confidence: null,
          manuallyConfirmed: true,
        }
      : { hole: index + 1, strokes: Number(cell), confidence: null, manuallyConfirmed: true },
  );
}

function seed(overrides: Partial<ScoringRoundSeed> = {}): ScoringRoundSeed {
  return {
    roundId: TEST_COURSE.roundId,
    tournamentId: "tournament-1",
    course: TEST_COURSE,
    // The event rule: one approved card makes a hole verified.
    policy: { requiredCards: 1, allowProvisionalSingleCard: false, minOcrConfidence: 0.85 },
    players: [
      {
        registrationId: "reg-p1",
        playerId: "p1",
        playerName: "Alpha",
        flightId: "flight-a",
        // The WHS snapshot the round was opened with. The card rule has to replace it.
        handicap: makeSnapshotFor(30),
      },
      {
        registrationId: "reg-p2",
        playerId: "p2",
        playerName: "Bravo",
        flightId: "flight-a",
        handicap: null,
      },
      {
        registrationId: "reg-p3",
        playerId: "p3",
        playerName: "Charlie",
        flightId: "flight-a",
        handicap: null,
      },
    ],
    rulesVersion: "bamboo-tee-2026",
    roundStatus: "open",
    ...overrides,
  };
}

function repository(overrides: Partial<ScoringRoundSeed> = {}) {
  let next = 0;
  let now = 0;
  return createDemoScoringRepository(seed(overrides), {
    actor: "desk-anna",
    idFactory: () => `id-${(next += 1)}`,
    now: () => Date.UTC(2026, 10, 14) + (now += 1000),
  });
}

function save(overrides: Partial<SaveEventCardInput> = {}): SaveEventCardInput {
  return {
    playerId: "p1",
    entries: entriesFrom(HAND_CARD),
    cardHandicap: "16.7",
    writtenTotal: null,
    captureKey: "key-1",
    approve: true,
    ...overrides,
  };
}

describe("saving a desk-checked card under the event rules", () => {
  it("scores a card with an X to the hand calculation", async () => {
    const repo = repository();
    const { view, outcome } = await repo.saveEventCard("tournament-1", save());

    expect(outcome).toBe("approved");
    const row = view.standings.net.rows.find((candidate) => candidate.playerId === "p1");
    expect(row).toMatchObject({ netPoints: 46, grossPoints: 31, grossStrokes: 73, complete: true });
    expect(row?.provisional).toBe(false);

    const player = view.players.find((candidate) => candidate.playerId === "p1");
    expect(player?.handicap).toMatchObject({
      rounding: "card",
      playingHandicap: 16,
      courseHandicap: 16,
      index: 16.7,
      rulesVersion: "bamboo-tee-2026",
    });
    expect(player?.canonical.counts).toMatchObject({ verified: 18, provisional: 0, conflict: 0 });
    // The X is a played hole with no stroke count.
    const seventh = player?.canonical.holes.find((hole) => hole.hole === 7);
    expect(seventh).toMatchObject({ pickedUp: true, strokes: null, status: "verified" });
  });

  it("uses the card's handicap, not the WHS snapshot the round was opened with", async () => {
    const repo = repository();
    const before = await repo.loadRound("tournament-1");
    expect(before?.players[0]?.handicap?.playingHandicap).toBe(33);

    const { view } = await repo.saveEventCard("tournament-1", save());
    expect(view.players[0]?.handicap?.playingHandicap).toBe(16);
  });

  it("counts a blank handicap box as 0", async () => {
    const repo = repository();
    const { view } = await repo.saveEventCard(
      "tournament-1",
      save({ playerId: "p2", cardHandicap: "", captureKey: "key-2" }),
    );
    const bravo = view.players.find((candidate) => candidate.playerId === "p2");
    expect(bravo?.handicap).toMatchObject({ rounding: "card", index: 0, playingHandicap: 0 });
    // Off 0, net points equal gross points.
    const row = view.standings.net.rows.find((candidate) => candidate.playerId === "p2");
    expect(row?.netPoints).toBe(31);
  });

  it("writes one approved card under a stable marker", async () => {
    const repo = repository();
    const { view } = await repo.saveEventCard("tournament-1", save());
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0]).toMatchObject({
      playerId: "p1",
      scorerId: "p2",
      status: "approved",
      source: "manual",
    });
  });

  it("is safe to repeat: the same card is already in", async () => {
    const repo = repository();
    await repo.saveEventCard("tournament-1", save());
    const again = await repo.saveEventCard("tournament-1", save({ captureKey: "key-again" }));
    expect(again.outcome).toBe("already_in");
    expect(again.view.cards).toHaveLength(1);
  });

  it("saves a card the desk has not checked yet without approving it", async () => {
    const repo = repository();
    const { view, outcome } = await repo.saveEventCard("tournament-1", save({ approve: false }));
    expect(outcome).toBe("saved");
    expect(view.cards[0]?.status).toBe("submitted");
    // Nothing counts until it is approved, but the card handicap is already recorded.
    expect(view.standings.net.rows).toEqual([]);
    expect(view.players[0]?.handicap?.playingHandicap).toBe(16);

    const later = await repo.saveEventCard("tournament-1", save({ approve: true }));
    expect(later.outcome).toBe("approved");
    expect(later.view.cards).toHaveLength(1);
    expect(later.view.standings.net.rows[0]?.netPoints).toBe(46);
  });

  it("refuses a round that is not on the event rules and writes nothing", async () => {
    const repo = repository({ rulesVersion: "demo-rules-v1" });
    await expect(repo.saveEventCard("tournament-1", save())).rejects.toThrow(
      "not on the event's card rules",
    );
    const view = await repo.loadRound("tournament-1");
    expect(view?.cards).toEqual([]);
  });

  it("refuses a round that asks for two cards", async () => {
    const repo = repository({
      policy: { requiredCards: 2, allowProvisionalSingleCard: true, minOcrConfidence: 0.85 },
    });
    await expect(repo.saveEventCard("tournament-1", save())).rejects.toThrow(
      "needs 2 cards per player",
    );
  });

  it("refuses a handicap it cannot read and writes nothing", async () => {
    const repo = repository();
    await expect(
      repo.saveEventCard("tournament-1", save({ cardHandicap: "+2.1" })),
    ).rejects.toThrow("not a plain number");
    const view = await repo.loadRound("tournament-1");
    expect(view?.cards).toEqual([]);
    expect(view?.players[0]?.handicap?.playingHandicap).toBe(33);
  });

  it("refuses to swap a frozen snapshot once the round is scoring", async () => {
    const repo = repository({ roundStatus: "scoring" });
    await expect(repo.saveEventCard("tournament-1", save())).rejects.toThrow("frozen");
    // A player with no snapshot yet can still take the card handicap while scoring.
    const bravo = await repo.saveEventCard(
      "tournament-1",
      save({ playerId: "p2", captureKey: "key-2", cardHandicap: "9.4" }),
    );
    expect(
      bravo.view.players.find((player) => player.playerId === "p2")?.handicap?.playingHandicap,
    ).toBe(9);
  });

  it("refuses a player marking their own card", async () => {
    const repo = repository();
    await expect(repo.saveEventCard("tournament-1", save({ scorerId: "p1" }))).rejects.toThrow(
      "own card",
    );
  });

  it("leaves the ordinary submit path as it was", async () => {
    const repo = repository({ rulesVersion: "demo-rules-v1" });
    const submitted = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "p2",
      source: "manual",
      entries: entriesFrom(HAND_CARD),
      writtenTotal: null,
      captureKey: "ordinary",
    });
    expect(submitted.cards[0]?.status).toBe("submitted");
    // Net still comes from the WHS snapshot, not from any card handicap.
    expect(submitted.players[0]?.handicap?.playingHandicap).toBe(33);
  });
});
