import { describe, expect, it } from "vitest";
import {
  makeSnapshotFor,
  parEntries,
  TEST_COURSE,
  TEST_POLICY,
} from "@/lib/scoring/__tests__/fixtures";
import { assessOpenRound, missingSettingsMessage, OPEN_ROUND_MESSAGES } from "./open-round";
import { createDemoScoringRepository, type OpenRoundInput, type ScoringRoundSeed } from "./scoring";

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
    finalizationAuthority: "organizer",
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
  it("carries the registration freeze beside the snapshot for the desk to compare", async () => {
    const first = seed().players[0];
    if (!first) throw new Error("The test seed needs a player.");
    const repo = repository({ players: [{ ...first, frozenIndex: 13.1 }] });

    const view = await repo.loadRound("tournament-1");

    expect(view?.players[0]?.frozenIndex).toBe(13.1);
    // The snapshot is untouched: it is still the value net scoring uses.
    expect(view?.players[0]?.handicap?.index).toBe(18);
  });

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

  it("stores a correction as a new revision and keeps the earlier card", async () => {
    const repo = repository();
    await submitAndApprove(repo, "p1", "s2", "original-card");

    const corrected = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s2",
      source: "manual",
      entries: parEntries().map((entry) => (entry.hole === 4 ? { ...entry, strokes: 5 } : entry)),
      writtenTotal: 73,
      captureKey: "correction-card",
      reason: "Hole 4 was written as 4; the card says 5.",
    });

    const revisions = corrected.cards
      .filter((card) => card.playerId === "p1" && card.scorerId === "s2")
      .map((card) => ({ revision: card.revision, status: card.status }));

    expect(revisions).toEqual([
      { revision: 1, status: "approved" },
      { revision: 2, status: "submitted" },
    ]);
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

  it("revokes an approved card so its holes stop counting", async () => {
    const repo = repository();
    const approved = await submitAndApprove(repo, "p1", "s2", "revoke-me");
    const card = approved.cards.find(
      (candidate) => candidate.playerId === "p1" && candidate.scorerId === "s2",
    );
    if (!card) throw new Error("Card not found.");
    expect(approved.players[0]?.canonical.counts.provisional).toBe(18);

    const revoked = await repo.revokeCard(
      "tournament-1",
      card.id,
      "The marker signed the wrong player's card.",
    );

    expect(revoked.cards.find((candidate) => candidate.id === card.id)?.status).toBe("revoked");
    expect(revoked.players[0]?.canonical.counts.provisional).toBe(0);
    expect(revoked.players[0]?.canonical.counts.verified).toBe(0);
    expect(revoked.standings.gross.rows).toHaveLength(0);
  });

  it("refuses a revocation without a reason, for a submitted card, or after the round is final", async () => {
    const repo = repository();
    const approved = await submitAndApprove(repo, "p1", "s2", "p1-1");
    const card = approved.cards[0];
    if (!card) throw new Error("Card not found.");

    await expect(repo.revokeCard("tournament-1", card.id, "  ")).rejects.toThrow(/reason/i);

    const submitted = await repo.submitCard("tournament-1", {
      playerId: "p2",
      scorerId: "s2",
      source: "manual",
      entries: parEntries(),
      writtenTotal: 72,
      captureKey: "p2-1",
    });
    const draft = submitted.cards.find((candidate) => candidate.playerId === "p2");
    if (!draft) throw new Error("Card not found.");
    await expect(repo.revokeCard("tournament-1", draft.id, "Not approved yet.")).rejects.toThrow(
      /approved/i,
    );

    await repo.approveCard("tournament-1", draft.id);
    await submitAndApprove(repo, "p1", "s3", "p1-2");
    await submitAndApprove(repo, "p2", "s3", "p2-2");
    await repo.publishRound("tournament-1");
    await repo.finalizeRound("tournament-1");

    await expect(repo.revokeCard("tournament-1", card.id, "Late change.")).rejects.toThrow(
      /final/i,
    );
  });
});

const SEEDED_GROUP = [{ number: 1, playerIds: ["p1", "p2"] }];

function openInput(overrides: Partial<OpenRoundInput> = {}): OpenRoundInput {
  return {
    requiredCards: 2,
    finalizationAuthority: "organizer",
    tieBreakPolicyId: TIE_BREAK.id,
    rulesVersion: "rules-2026-11",
    expectedRevision: 1,
    ...overrides,
  };
}

describe("demo scoring repository opening a round", () => {
  it("opens a draft round from a published draw", async () => {
    const repo = repository({ roundStatus: "draft" });
    const before = await repo.loadRound("tournament-1");

    const opened = await repo.openRound("tournament-1", openInput({ requiredCards: 3 }));

    expect(opened.roundStatus).toBe("open");
    expect(opened.rulesVersion).toBe("rules-2026-11");
    expect(opened.requiredCards).toBe(3);
    expect(opened.policy.requiredCards).toBe(3);
    expect(opened.finalizationAuthority).toBe("organizer");
    // The demo seed already holds the players, so the entry list does not change.
    expect(opened.players.map((player) => player.playerId)).toEqual(
      before?.players.map((player) => player.playerId),
    );
    expect(opened.cards).toEqual([]);
  });

  it("treats a second open from the same revision as a no-op", async () => {
    const repo = repository({ roundStatus: "draft" });

    const first = await repo.openRound("tournament-1", openInput());
    const second = await repo.openRound("tournament-1", openInput());

    expect(second.roundStatus).toBe("open");
    expect(second.requiredCards).toBe(first.requiredCards);
    expect(second.rulesVersion).toBe(first.rulesVersion);
    expect(second.tieBreak).toEqual(first.tieBreak);
    expect(second.cards).toEqual(first.cards);
    expect(second.players.map((player) => player.playerId)).toEqual(
      first.players.map((player) => player.playerId),
    );
  });

  it("refuses an already open round when the screen's revision is stale", async () => {
    const repo = repository({
      roundStatus: "open",
      draw: { revision: 2, published: true, groups: SEEDED_GROUP },
    });

    await expect(
      repo.openRound("tournament-1", openInput({ expectedRevision: 1 })),
    ).rejects.toThrow(OPEN_ROUND_MESSAGES.staleRevision);
  });

  it("refuses a stale revision and a draw that moved after publication", async () => {
    const stale = repository({
      roundStatus: "draft",
      draw: { revision: 2, published: true, groups: SEEDED_GROUP },
    });
    await expect(
      stale.openRound("tournament-1", openInput({ expectedRevision: 1 })),
    ).rejects.toThrow(OPEN_ROUND_MESSAGES.staleRevision);

    const moved = repository({
      roundStatus: "draft",
      draw: {
        revision: 1,
        published: true,
        groups: SEEDED_GROUP,
        liveGroups: [{ number: 1, playerIds: ["p1"] }],
      },
    });
    await expect(moved.openRound("tournament-1", openInput())).rejects.toThrow(
      OPEN_ROUND_MESSAGES.drawMoved,
    );
  });

  it("refuses each missing setting and names it", async () => {
    const repo = repository({ roundStatus: "draft" });

    await expect(
      repo.openRound("tournament-1", openInput({ requiredCards: null })),
    ).rejects.toThrow(missingSettingsMessage(["requiredCards"]));
    await expect(
      repo.openRound("tournament-1", openInput({ finalizationAuthority: null })),
    ).rejects.toThrow(missingSettingsMessage(["finalizationAuthority"]));
    await expect(
      repo.openRound("tournament-1", openInput({ tieBreakPolicyId: "tb-unknown" })),
    ).rejects.toThrow(missingSettingsMessage(["tieBreakPolicyId"]));
    await expect(repo.openRound("tournament-1", openInput({ rulesVersion: "  " }))).rejects.toThrow(
      missingSettingsMessage(["rulesVersion"]),
    );
  });

  it("refuses an unpublished draw and a publish without player ids", async () => {
    const unpublished = repository({
      roundStatus: "draft",
      draw: { revision: 1, published: false, groups: SEEDED_GROUP },
    });
    await expect(unpublished.openRound("tournament-1", openInput())).rejects.toThrow(
      OPEN_ROUND_MESSAGES.notPublished,
    );

    const noPlayerIds = repository({
      roundStatus: "draft",
      draw: { revision: 1, published: true, groups: SEEDED_GROUP, hasPlayerIds: false },
    });
    await expect(noPlayerIds.openRound("tournament-1", openInput())).rejects.toThrow(
      OPEN_ROUND_MESSAGES.missingPlayerIds,
    );
  });

  it("opens with a confirmed tie-break and refuses an unconfirmed one", async () => {
    const confirmed = repository({ roundStatus: "draft" });
    await expect(confirmed.openRound("tournament-1", openInput())).resolves.toMatchObject({
      roundStatus: "open",
    });

    const unconfirmed = repository({
      roundStatus: "draft",
      tieBreak: { ...TIE_BREAK, confirmedBy: "", confirmedAt: "" },
    });
    await expect(unconfirmed.openRound("tournament-1", openInput())).rejects.toThrow(
      OPEN_ROUND_MESSAGES.tieBreakUnconfirmed,
    );
  });

  it("agrees with the shared assessment for the same state and input", async () => {
    const repo = repository({
      roundStatus: "draft",
      draw: { revision: 2, published: true, groups: SEEDED_GROUP },
    });
    const input = openInput({ expectedRevision: 1 });
    const state = await repo.loadOpenRoundState("tournament-1");
    const assessment = assessOpenRound(state, input, input.expectedRevision);

    expect(assessment.state).toBe("draw_moved");
    await expect(repo.openRound("tournament-1", input)).rejects.toThrow(assessment.message);

    const settingsRepo = repository({ roundStatus: "draft" });
    const missingInput = openInput({ requiredCards: null });
    const settingsState = await settingsRepo.loadOpenRoundState("tournament-1");
    const settingsAssessment = assessOpenRound(
      settingsState,
      missingInput,
      missingInput.expectedRevision,
    );

    expect(settingsAssessment).toMatchObject({
      state: "missing_settings",
      missing: ["requiredCards"],
    });
    await expect(settingsRepo.openRound("tournament-1", missingInput)).rejects.toThrow(
      OPEN_ROUND_MESSAGES.missingSettingsPrefix + "required cards.",
    );
  });
});
