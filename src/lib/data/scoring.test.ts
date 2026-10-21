import { describe, expect, it } from "vitest";
import {
  makeSnapshotFor,
  parEntries,
  TEST_COURSE,
  TEST_POLICY,
} from "@/lib/scoring/__tests__/fixtures";
import { createDemoScoringRepository, type ScoringRoundSeed } from "./scoring";

const TIE_BREAK = {
  id: "tb-demo",
  name: "Back 9, then back 6, then back 3, then last hole",
  source: "Demo policy, not the organizer's rule",
  confirmedBy: "demo-organizer",
  confirmedAt: "2026-10-21T00:00:00.000Z",
};

function seed(overrides: Partial<ScoringRoundSeed> = {}): ScoringRoundSeed {
  return {
    roundId: TEST_COURSE.roundId,
    tournamentId: "tournament-1",
    course: TEST_COURSE,
    policy: TEST_POLICY,
    players: [
      {
        registrationId: "reg-p1",
        playerId: "p1",
        playerName: "Alpha",
        flightId: "flight-a",
        handicap: makeSnapshotFor(18),
      },
      {
        registrationId: "reg-p2",
        playerId: "p2",
        playerName: "Bravo",
        flightId: "flight-a",
        handicap: makeSnapshotFor(0),
      },
    ],
    tieBreak: TIE_BREAK,
    approvedBy: "organizer-1",
    provisionalPublication: true,
    ...overrides,
  };
}

function repository(overrides: Partial<ScoringRoundSeed> = {}) {
  let next = 0;
  let now = 0;
  return createDemoScoringRepository(seed(overrides), {
    actor: "desk-anna",
    idFactory: () => `id-${(next += 1)}`,
    now: () => (now += 1000),
  });
}

async function submitAndApprove(
  repo: ReturnType<typeof repository>,
  playerId: string,
  scorerId: string,
  captureKey: string,
) {
  const submitted = await repo.submitCard("tournament-1", {
    playerId,
    scorerId,
    source: "manual",
    entries: parEntries(),
    writtenTotal: 72,
    captureKey,
  });
  const card = submitted.cards.find(
    (candidate) => candidate.playerId === playerId && candidate.scorerId === scorerId,
  );
  if (!card) throw new Error("Submitted card was not found.");
  return repo.approveCard("tournament-1", card.id);
}

describe("demo scoring repository", () => {
  it("starts with no eligible holes and a blocked finalization", async () => {
    const repo = repository();
    const view = await repo.loadRound("tournament-1");

    expect(view).not.toBeNull();
    expect(view?.standings.excluded).toHaveLength(2);
    expect(view?.finalization.ready).toBe(false);
    expect(view?.finalization.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "round_incomplete" })]),
    );
  });

  it("turns one approved card into provisional holes and two into verified holes", async () => {
    const repo = repository();
    const first = await submitAndApprove(repo, "p1", "s2", "capture-1");

    expect(first.players[0]?.canonical.counts.provisional).toBe(18);
    expect(first.players[0]?.canonical.counts.verified).toBe(0);

    const second = await submitAndApprove(repo, "p1", "s3", "capture-2");

    expect(second.players[0]?.canonical.counts.verified).toBe(18);
    expect(second.players[0]?.canonical.complete).toBe(true);
    expect(second.standings.gross.rows.some((row) => row.playerId === "p1")).toBe(true);
  });

  it("keeps a disagreement as a conflict and resolves it with a reason", async () => {
    const repo = repository();
    await submitAndApprove(repo, "p1", "s2", "capture-1");

    const submitted = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s3",
      source: "manual",
      entries: parEntries().map((entry) => (entry.hole === 5 ? { ...entry, strokes: 5 } : entry)),
      writtenTotal: 73,
      captureKey: "capture-2",
    });
    const card = submitted.cards.find(
      (candidate) => candidate.playerId === "p1" && candidate.scorerId === "s3",
    );
    if (!card) throw new Error("Card not found.");
    const conflicted = await repo.approveCard("tournament-1", card.id);

    expect(conflicted.players[0]?.canonical.holes.find((hole) => hole.hole === 5)).toMatchObject({
      status: "conflict",
      strokes: null,
    });
    expect(conflicted.standings.gross.rows[0]?.holesCounted).toBe(17);

    const resolved = await repo.resolveHole("tournament-1", {
      playerId: "p1",
      hole: 5,
      strokes: 4,
      reason: "Both markers checked the card with the player.",
    });

    expect(resolved.players[0]?.canonical.holes.find((hole) => hole.hole === 5)).toMatchObject({
      status: "verified",
      strokes: 4,
      provenance: "desk_resolution",
    });
    expect(resolved.resolutions.at(-1)).toMatchObject({
      hole: 5,
      strokes: 4,
      resolvedBy: "desk-anna",
      reason: "Both markers checked the card with the player.",
    });
    expect(resolved.standings.gross.rows[0]?.holesCounted).toBe(18);
  });

  it("retries a capture key without creating a second card", async () => {
    const repo = repository();
    const first = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s2",
      source: "upload",
      entries: parEntries(),
      writtenTotal: 72,
      captureKey: "same-capture",
    });
    const second = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s2",
      source: "upload",
      entries: parEntries(),
      writtenTotal: 72,
      captureKey: "same-capture",
    });

    expect(first.cards).toHaveLength(1);
    expect(second.cards).toHaveLength(1);
  });

  it("refuses to approve a low-confidence value that nobody confirmed", async () => {
    const repo = repository();
    const submitted = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s2",
      source: "webcam",
      entries: parEntries().map((entry) =>
        entry.hole === 4 ? { ...entry, confidence: 0.4, manuallyConfirmed: false } : entry,
      ),
      writtenTotal: 72,
      captureKey: "low-confidence",
    });
    const card = submitted.cards[0];
    if (!card) throw new Error("Card not found.");

    await expect(repo.approveCard("tournament-1", card.id)).rejects.toThrow(
      /low-confidence|confirm/i,
    );
  });

  it("publishes provisional results and finalizes only when every gate is satisfied", async () => {
    const repo = repository();
    await submitAndApprove(repo, "p1", "s2", "p1-1");
    await submitAndApprove(repo, "p1", "s3", "p1-2");
    await submitAndApprove(repo, "p2", "s2", "p2-1");
    await submitAndApprove(repo, "p2", "s3", "p2-2");

    const published = await repo.publishRound("tournament-1");
    expect(published.publications).toEqual([
      expect.objectContaining({ version: 1, state: "provisional" }),
    ]);
    expect(published.roundStatus).toBe("provisional");
    expect(published.standings.gross.rows).toHaveLength(2);

    const finalized = await repo.finalizeRound("tournament-1");
    expect(finalized.roundStatus).toBe("final");
    expect(finalized.publications).toEqual([
      expect.objectContaining({ version: 1, state: "provisional" }),
      expect.objectContaining({ version: 2, state: "final" }),
    ]);
  });

  it("blocks finalization when the organizer's tie-break rule is missing", async () => {
    const repo = repository({ tieBreak: null });
    await submitAndApprove(repo, "p1", "s2", "p1-1");
    await submitAndApprove(repo, "p1", "s3", "p1-2");
    await submitAndApprove(repo, "p2", "s2", "p2-1");
    await submitAndApprove(repo, "p2", "s3", "p2-2");

    const view = await repo.loadRound("tournament-1");
    expect(view?.finalization.ready).toBe(false);
    await expect(repo.finalizeRound("tournament-1")).rejects.toThrow(/tie-break/i);
  });
});
