import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseScoringRepository } from "@/lib/data/supabase/scoring";
import {
  makeSnapshotFor,
  parEntries,
  TEST_COURSE,
  TEST_POLICY,
} from "@/lib/scoring/__tests__/fixtures";
import type { Database } from "@/lib/supabase/types";
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

/** The par card with one hole written as an X instead of a score. */
function pickupEntries(hole: number) {
  return parEntries().map((entry) =>
    entry.hole === hole
      ? { hole, strokes: null, pickedUp: true as const, confidence: null, manuallyConfirmed: true }
      : entry,
  );
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
      // Hole 4 is a par 5, so the stored score has to actually move for this to be a correction.
      entries: parEntries().map((entry) => (entry.hole === 4 ? { ...entry, strokes: 6 } : entry)),
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

  it("does not write a second card when the same card arrives again with a new capture key", async () => {
    const repo = repository();
    await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s2",
      source: "manual",
      entries: parEntries(),
      writtenTotal: 72,
      captureKey: "capture-a",
    });

    const again = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s2",
      source: "manual",
      entries: parEntries(),
      writtenTotal: 72,
      captureKey: "capture-b",
    });

    expect(again.cards).toHaveLength(1);
  });

  it("does not create a revision when a correction changed nothing", async () => {
    const repo = repository();
    await submitAndApprove(repo, "p1", "s2", "original-card");

    const unchanged = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s2",
      source: "manual",
      entries: parEntries(),
      writtenTotal: 72,
      captureKey: "correction-same",
      reason: "Checking the card again.",
    });

    expect(unchanged.cards).toHaveLength(1);
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

  it("submits and approves a pick-up, counts the hole and gives it 0 points", async () => {
    const repo = repository();
    const submitted = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s2",
      source: "manual",
      entries: pickupEntries(5),
      writtenTotal: 72,
      captureKey: "pickup-card",
    });
    const card = submitted.cards[0];
    if (!card) throw new Error("Card not found.");

    const approved = await repo.approveCard("tournament-1", card.id);

    expect(approved.players[0]?.canonical.holes.find((hole) => hole.hole === 5)).toMatchObject({
      status: "provisional",
      strokes: null,
      pickedUp: true,
    });
    const row = approved.standings.gross.rows.find((candidate) => candidate.playerId === "p1");
    // 17 holes at par score 2 points each; the pick-up counts as played and scores 0.
    expect(row?.holesCounted).toBe(18);
    expect(row?.grossPoints).toBe(34);
  });

  it("resolves a number-against-X conflict as a pick-up", async () => {
    const repo = repository();
    await submitAndApprove(repo, "p1", "s2", "capture-1");

    const submitted = await repo.submitCard("tournament-1", {
      playerId: "p1",
      scorerId: "s3",
      source: "manual",
      entries: pickupEntries(5),
      writtenTotal: 72,
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

    const resolved = await repo.resolveHole("tournament-1", {
      playerId: "p1",
      hole: 5,
      strokes: 0,
      pickedUp: true,
      reason: "The card shows an X on hole 5.",
    });

    expect(resolved.players[0]?.canonical.holes.find((hole) => hole.hole === 5)).toMatchObject({
      status: "verified",
      strokes: null,
      pickedUp: true,
      provenance: "desk_resolution",
    });
    expect(resolved.resolutions.at(-1)).toMatchObject({
      hole: 5,
      strokes: 0,
      pickedUp: true,
      previousStrokes: null,
    });
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

type Row = Record<string, unknown>;

interface Chain {
  select: () => Chain;
  eq: (column: string, value: unknown) => Chain;
  in: () => Chain;
  is: () => Chain;
  order: () => Chain;
  limit: () => Chain;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (
    resolve: (value: { data: Row[]; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

const WIRE_ROUND: Row = {
  id: TEST_COURSE.roundId,
  tournament_id: "t1",
  day_number: 1,
  status: "open",
  required_cards: 2,
  allow_provisional_single_card: true,
  min_ocr_confidence: 0.85,
  tie_break_policy_id: null,
  finalization_authority: "organizer",
  rules_version: "rules-v1",
  provisional_publication: "off",
  stroke_min: 1,
  stroke_max: 20,
};

const WIRE_HOLES: Row[] = TEST_COURSE.holes.map((hole) => ({
  number: hole.number,
  par: hole.par,
  stroke_index: hole.strokeIndex,
}));

const WIRE_TEE: Row = {
  id: TEST_COURSE.tee.id,
  name: TEST_COURSE.tee.name,
  course_rating: TEST_COURSE.tee.courseRating,
  slope: TEST_COURSE.tee.slope,
  par: TEST_COURSE.tee.par,
};

const WIRE_PLAYER_ID = "p1";

/**
 * A fake client for the card writes, in the style of `supabase/scoring-day.test.ts`.
 *
 * It stores the row `submit_scorecard` would insert only so the repository's refresh can return it;
 * the revision number and its idempotency are the SQL function's contract, not this fake's.
 */
function fakeScoringClient(
  seedCards: Row[] = [],
  seedEntries: Row[] = [],
  seedResolutions: Row[] = [],
) {
  const cards = seedCards.map((card) => ({ ...card }));
  const entries = seedEntries.map((entry) => ({ ...entry }));
  const resolutions = seedResolutions.map((resolution) => ({ ...resolution }));
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  function rowsFor(table: string): Row[] {
    switch (table) {
      case "competition_rounds":
        return [WIRE_ROUND];
      case "round_entries":
        return [
          {
            id: "entry-p1",
            round_id: TEST_COURSE.roundId,
            registration_id: "reg-p1",
            status: "active",
            flight_id: null,
          },
        ];
      case "registrations":
        return [{ id: "reg-p1", player_id: WIRE_PLAYER_ID, frozen_index: 10 }];
      case "players":
        return [{ id: WIRE_PLAYER_ID, full_name: "Alpha One" }];
      case "holes":
        return WIRE_HOLES;
      case "tees":
        return [WIRE_TEE];
      case "scorecards":
        return cards;
      case "scorecard_entries":
        return entries;
      case "hole_resolutions":
        return resolutions;
      default:
        // Handicap snapshots, card images, resolutions and publications are empty for this fixture.
        return [];
    }
  }

  function query(table: string): Chain {
    const chain: Chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === "tournaments") {
          return {
            data: { id: "t1", club_id: "club-1", course_id: "course-1" },
            error: null,
          };
        }
        return { data: rowsFor(table)[0] ?? null, error: null };
      },
      then: (resolve, reject) =>
        Promise.resolve({ data: rowsFor(table), error: null }).then(resolve, reject),
    };
    return chain;
  }

  const client = {
    from: (table: string) => query(table),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name !== "submit_scorecard") return { data: null, error: null };

      const scorerId = String(args.p_scorer_id);
      const previous = cards.filter(
        (card) => card.player_id === WIRE_PLAYER_ID && card.scorer_id === scorerId,
      );
      const revision = Math.max(0, ...previous.map((card) => Number(card.revision))) + 1;
      const id = `card-${cards.length + 1}`;
      cards.push({
        id,
        round_id: TEST_COURSE.roundId,
        player_id: WIRE_PLAYER_ID,
        scorer_id: scorerId,
        source: args.p_source,
        revision,
        status: "submitted",
        written_total: args.p_written_total ?? null,
        capture_key: args.p_capture_key,
        submitted_at: "2026-11-12T00:00:00.000Z",
      });
      for (const entry of Array.isArray(args.p_entries) ? (args.p_entries as Row[]) : []) {
        entries.push({
          scorecard_id: id,
          hole_number: entry.hole,
          strokes: entry.strokes,
          confidence: entry.confidence,
          manually_confirmed: entry.manually_confirmed,
        });
      }
      return { data: id, error: null };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, rpcCalls };
}

describe("connected scoring repository writing a card", () => {
  it("sends a first card with its capture key and records no correction", async () => {
    const fake = fakeScoringClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    const view = await repo.submitCard("t1", {
      playerId: WIRE_PLAYER_ID,
      scorerId: "p2",
      source: "manual",
      entries: parEntries(),
      writtenTotal: 72,
      captureKey: "capture-first",
    });

    expect(fake.rpcCalls.map((call) => call.name)).toEqual(["submit_scorecard"]);
    expect(fake.rpcCalls[0]?.args).toMatchObject({
      p_round_entry: "entry-p1",
      p_capture_key: "capture-first",
    });
    expect(view.cards).toEqual([
      expect.objectContaining({ id: "card-1", revision: 1, status: "submitted" }),
    ]);
  });

  it("writes a correction as a new revision and records its reason", async () => {
    const reason = "Hole 4 was written as 4; the card says 5.";
    const fake = fakeScoringClient(
      [
        {
          id: "card-1",
          round_id: TEST_COURSE.roundId,
          player_id: WIRE_PLAYER_ID,
          scorer_id: "p2",
          source: "manual",
          revision: 1,
          status: "approved",
          written_total: 72,
          capture_key: "capture-first",
          submitted_at: "2026-11-11T00:00:00.000Z",
        },
      ],
      parEntries().map((entry) => ({
        scorecard_id: "card-1",
        hole_number: entry.hole,
        strokes: entry.strokes,
        confidence: entry.confidence,
        manually_confirmed: entry.manuallyConfirmed,
      })),
    );
    const repo = createSupabaseScoringRepository({ client: fake.client });

    const view = await repo.submitCard("t1", {
      playerId: WIRE_PLAYER_ID,
      scorerId: "p2",
      source: "manual",
      entries: parEntries().map((entry) => (entry.hole === 4 ? { ...entry, strokes: 6 } : entry)),
      writtenTotal: 73,
      captureKey: "capture-correction",
      reason,
    });

    expect(fake.rpcCalls.map((call) => call.name)).toEqual([
      "submit_scorecard",
      "record_scorecard_correction",
    ]);
    expect(fake.rpcCalls[0]?.args).toMatchObject({ p_capture_key: "capture-correction" });
    // A correction is its own revision, so it never reuses the original card's key.
    expect(fake.rpcCalls[0]?.args.p_capture_key).not.toBe("capture-first");
    // The reason belongs to the revision that was just written, not to the card being corrected.
    expect(fake.rpcCalls[1]?.args).toEqual({ p_card: "card-2", p_reason: reason });
    expect(view.cards).toEqual([
      expect.objectContaining({ id: "card-1", revision: 1, status: "approved" }),
      expect.objectContaining({ id: "card-2", revision: 2, status: "submitted" }),
    ]);
  });

  it("sends a pick-up entry with null strokes and picked_up true", async () => {
    const fake = fakeScoringClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    await repo.submitCard("t1", {
      playerId: WIRE_PLAYER_ID,
      scorerId: "p2",
      source: "manual",
      entries: parEntries().map((entry) =>
        entry.hole === 5
          ? {
              hole: 5,
              strokes: null,
              pickedUp: true as const,
              confidence: null,
              manuallyConfirmed: true,
            }
          : entry,
      ),
      writtenTotal: 72,
      captureKey: "capture-pickup",
    });

    const sent = fake.rpcCalls[0]?.args.p_entries as Row[];
    expect(sent.find((entry) => entry.hole === 5)).toEqual({
      hole: 5,
      strokes: null,
      confidence: null,
      manually_confirmed: true,
      picked_up: true,
    });
    expect(sent.find((entry) => entry.hole === 1)).toEqual({
      hole: 1,
      strokes: 4,
      confidence: null,
      manually_confirmed: true,
    });
  });

  it("sends a card with no pick-up exactly as it did before", async () => {
    const fake = fakeScoringClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    await repo.submitCard("t1", {
      playerId: WIRE_PLAYER_ID,
      scorerId: "p2",
      source: "manual",
      entries: parEntries(),
      writtenTotal: 72,
      captureKey: "capture-plain",
    });

    expect(fake.rpcCalls[0]?.args.p_entries).toEqual(
      parEntries().map((entry) => ({
        hole: entry.hole,
        strokes: entry.strokes,
        confidence: entry.confidence,
        manually_confirmed: entry.manuallyConfirmed,
      })),
    );
  });
});

describe("demo scoring repository by day", () => {
  it("loads only the round for the day it was given, and the first round when no day is named", async () => {
    const repo = repository({ dayNumber: 2 });

    expect((await repo.loadRound("tournament-1", 2))?.dayNumber).toBe(2);
    expect(await repo.loadRound("tournament-1", 1)).toBeNull();
    expect((await repo.loadRound("tournament-1"))?.dayNumber).toBe(2);
  });
});

const READ_CARD_ID = "card-read";

function wireCard(id: string, scorerId: string, status: string): Row {
  return {
    id,
    round_id: TEST_COURSE.roundId,
    player_id: WIRE_PLAYER_ID,
    scorer_id: scorerId,
    source: "manual",
    revision: 1,
    status,
    written_total: 72,
    submitted_at: "2026-11-12T00:00:00.000Z",
  };
}

/** The 18 entry rows for a card, with one hole written as a pick-up when asked. */
function wireCardEntries(cardId: string, pickupHole?: number): Row[] {
  return parEntries().map((entry) => ({
    scorecard_id: cardId,
    hole_number: entry.hole,
    strokes: entry.hole === pickupHole ? null : entry.strokes,
    ...(entry.hole === pickupHole ? { picked_up: true } : {}),
    confidence: entry.confidence,
    manually_confirmed: entry.manuallyConfirmed,
  }));
}

describe("connected scoring repository reading pick-ups", () => {
  it("reads a pick-up entry as pickedUp and leaves an ordinary entry unchanged", async () => {
    const fake = fakeScoringClient(
      [wireCard(READ_CARD_ID, "p2", "approved")],
      wireCardEntries(READ_CARD_ID, 5),
    );
    const repo = createSupabaseScoringRepository({ client: fake.client });

    const view = await repo.loadRound("t1");
    const entries = view?.cards[0]?.entries ?? [];

    expect(entries.find((entry) => entry.hole === 5)).toEqual({
      hole: 5,
      strokes: null,
      pickedUp: true,
      confidence: null,
      manuallyConfirmed: true,
    });
    expect(entries.find((entry) => entry.hole === 1)).toEqual({
      hole: 1,
      strokes: 4,
      confidence: null,
      manuallyConfirmed: true,
    });
  });

  it("reads a pick-up resolution as pickedUp and an ordinary one as before", async () => {
    const resolutions: Row[] = [
      {
        id: "res-1",
        round_id: TEST_COURSE.roundId,
        player_id: WIRE_PLAYER_ID,
        hole_number: 5,
        strokes: 0,
        picked_up: true,
        resolved_by: "desk",
        resolved_at: "2026-11-12T00:00:00.000Z",
        reason: "The card shows an X.",
        evidence_card_ids: [],
        previous_strokes: null,
      },
      {
        id: "res-2",
        round_id: TEST_COURSE.roundId,
        player_id: WIRE_PLAYER_ID,
        hole_number: 6,
        strokes: 4,
        resolved_by: "desk",
        resolved_at: "2026-11-12T00:01:00.000Z",
        reason: "Both markers agreed.",
        evidence_card_ids: [],
        previous_strokes: null,
      },
    ];
    const fake = fakeScoringClient([], [], resolutions);
    const repo = createSupabaseScoringRepository({ client: fake.client });

    const view = await repo.loadRound("t1");

    expect(view?.resolutions.find((resolution) => resolution.hole === 5)).toEqual({
      id: "res-1",
      roundId: TEST_COURSE.roundId,
      playerId: WIRE_PLAYER_ID,
      hole: 5,
      strokes: 0,
      pickedUp: true,
      resolvedBy: "desk",
      resolvedAt: "2026-11-12T00:00:00.000Z",
      reason: "The card shows an X.",
      evidenceCardIds: [],
      previousStrokes: null,
    });
    expect(view?.resolutions.find((resolution) => resolution.hole === 6)).toEqual({
      id: "res-2",
      roundId: TEST_COURSE.roundId,
      playerId: WIRE_PLAYER_ID,
      hole: 6,
      strokes: 4,
      resolvedBy: "desk",
      resolvedAt: "2026-11-12T00:01:00.000Z",
      reason: "Both markers agreed.",
      evidenceCardIds: [],
      previousStrokes: null,
    });
  });
});

describe("connected scoring repository proposing canonical pick-ups", () => {
  it("sends a verified pick-up as 0 strokes with pickedUp and leaves a number unchanged", async () => {
    const fake = fakeScoringClient(
      [wireCard("card-1", "p2", "approved"), wireCard("card-2", "p3", "submitted")],
      [...wireCardEntries("card-1", 5), ...wireCardEntries("card-2", 5)],
    );
    const repo = createSupabaseScoringRepository({ client: fake.client });

    await repo.approveCard("t1", "card-2");

    const approved = fake.rpcCalls.find((call) => call.name === "approve_scorecard");
    const canonical = approved?.args.p_canonical as Row[];
    expect(canonical.find((row) => row.hole === 5)).toEqual({
      hole: 5,
      strokes: 0,
      pickedUp: true,
      verification: "verified",
      provenance: "agreement",
    });
    expect(canonical.find((row) => row.hole === 1)).toEqual({
      hole: 1,
      strokes: 4,
      verification: "verified",
      provenance: "agreement",
    });
  });
});

describe("connected scoring repository resolving a hole", () => {
  it("sends 0 strokes when the hole is settled as a pick-up", async () => {
    const fake = fakeScoringClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    await repo.resolveHole("t1", {
      playerId: WIRE_PLAYER_ID,
      hole: 5,
      strokes: 0,
      pickedUp: true,
      reason: "The card shows an X.",
    });

    const resolved = fake.rpcCalls.find((call) => call.name === "resolve_hole");
    expect(resolved?.args.p_strokes).toBe(0);
  });

  it("sends the number when the hole is settled with a score", async () => {
    const fake = fakeScoringClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    await repo.resolveHole("t1", {
      playerId: WIRE_PLAYER_ID,
      hole: 5,
      strokes: 4,
      reason: "Both markers agreed.",
    });

    const resolved = fake.rpcCalls.find((call) => call.name === "resolve_hole");
    expect(resolved?.args.p_strokes).toBe(4);
  });
});
