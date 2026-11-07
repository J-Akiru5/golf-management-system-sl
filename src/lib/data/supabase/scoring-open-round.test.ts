import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { assessOpenRound, OPEN_ROUND_MESSAGES, openRoundErrorMessage } from "@/lib/data/open-round";
import {
  createDemoScoringRepository,
  type OpenRoundInput,
  type ScoringRoundSeed,
} from "@/lib/data/scoring";
import { makeSnapshotFor, TEST_COURSE, TEST_POLICY } from "@/lib/scoring/__tests__/fixtures";
import type { Database } from "@/lib/supabase/generated-types";
import { openRoundRequest, publishedGroupsFromJson } from "./scoring";

type Reply = { data: unknown; error: { message: string } | null };

function fakeClient(reply: Reply) {
  const rpc = vi.fn().mockResolvedValue(reply);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

const BASE_INPUT: OpenRoundInput = {
  expectedRevision: 4,
  requiredCards: 2,
  finalizationAuthority: "organizer",
  tieBreakPolicyId: "tb-1",
  rulesVersion: "rules-v1",
  dayNumber: 2,
};

async function messageFrom(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("openRoundRequest", () => {
  it("sends every argument the function declares", async () => {
    const { client, rpc } = fakeClient({ data: "round-9", error: null });

    await expect(openRoundRequest(client, "t1", BASE_INPUT)).resolves.toBe("round-9");

    expect(rpc).toHaveBeenCalledWith("open_round", {
      p_tournament: "t1",
      p_expected_revision: 4,
      p_required_cards: 2,
      p_finalization_authority: "organizer",
      p_tie_break_policy_id: "tb-1",
      p_rules_version: "rules-v1",
      p_day_number: 2,
    });
  });

  it("sends explicit nulls for the values the desk left out", async () => {
    const { client, rpc } = fakeClient({ data: "round-9", error: null });

    await openRoundRequest(client, "t1", { expectedRevision: 7 });

    expect(rpc).toHaveBeenCalledWith("open_round", {
      p_tournament: "t1",
      p_expected_revision: 7,
      p_required_cards: null,
      p_finalization_authority: null,
      p_tie_break_policy_id: null,
      p_rules_version: null,
      p_day_number: null,
    });
  });

  it("returns the round id the function assigned", async () => {
    const { client } = fakeClient({ data: "9f1c0d7e-3a4b-4c5d-8e9f-000000000001", error: null });

    await expect(openRoundRequest(client, "t1", BASE_INPUT)).resolves.toBe(
      "9f1c0d7e-3a4b-4c5d-8e9f-000000000001",
    );
  });

  it("refuses a response that is not a round id", async () => {
    const { client } = fakeClient({ data: 42, error: null });

    await expect(openRoundRequest(client, "t1", BASE_INPUT)).rejects.toThrow("no round id");
  });

  it.each([
    ["open_round_stale_revision: the draw is now revision 5", OPEN_ROUND_MESSAGES.staleRevision],
    ["open_round_draw_moved: the signature differs", OPEN_ROUND_MESSAGES.drawMoved],
    ["open_round_not_published", OPEN_ROUND_MESSAGES.notPublished],
    [
      "open_round_missing_player_ids: the publish has names only",
      OPEN_ROUND_MESSAGES.missingPlayerIds,
    ],
    ["open_round_tie_break_unconfirmed: policy tb-1", OPEN_ROUND_MESSAGES.tieBreakUnconfirmed],
    ["open_round_already_open: round r1", OPEN_ROUND_MESSAGES.alreadyOpen],
    ["open_round_no_playing_day: no competition round", OPEN_ROUND_MESSAGES.noPlayingDay],
    [
      "open_round_missing_settings: required cards, tie-break policy",
      `${OPEN_ROUND_MESSAGES.missingSettingsPrefix}required cards, tie-break policy.`,
    ],
  ])("maps %s to the sentence the desk reads", async (refusal, sentence) => {
    const { client } = fakeClient({ data: null, error: { message: refusal } });

    const message = await messageFrom(openRoundRequest(client, "t1", BASE_INPUT));

    expect(message).toBe(sentence);
  });
});

describe("publishedGroupsFromJson", () => {
  it("reads the player ids from a current publish", () => {
    const snapshot = {
      at: "2026-11-08T00:00:00.000Z",
      signature: "1:p1,p2|2:p3",
      groups: [
        { number: 1, players: ["Alpha", "Bravo"], playerIds: ["p1", "p2"] },
        { number: 2, players: ["Charlie"], playerIds: ["p3"] },
      ],
    };

    expect(publishedGroupsFromJson(snapshot)).toEqual([
      { number: 1, playerIds: ["p1", "p2"] },
      { number: 2, playerIds: ["p3"] },
    ]);
  });

  it("treats a names-only publish as absent instead of matching by name", () => {
    const snapshot = {
      groups: [{ number: 1, players: ["Alpha", "Bravo"] }],
    };

    expect(publishedGroupsFromJson(snapshot)).toBeNull();
  });

  it("returns null when the snapshot or its groups are missing", () => {
    expect(publishedGroupsFromJson(null)).toBeNull();
    expect(publishedGroupsFromJson(undefined)).toBeNull();
    expect(publishedGroupsFromJson({ signature: "1:p1" })).toBeNull();
  });

  it("returns null when the published list is empty", () => {
    expect(publishedGroupsFromJson({ groups: [] })).toBeNull();
  });

  it("returns null when any group carries a non-string player id", () => {
    const snapshot = {
      groups: [
        { number: 1, playerIds: ["p1"] },
        { number: 2, playerIds: [3] },
      ],
    };

    expect(publishedGroupsFromJson(snapshot)).toBeNull();
  });
});

const TIE_BREAK = {
  id: "tb-demo",
  name: "Back 9, then back 6, then back 3, then last hole",
  source: "Demo policy, not the organizer's rule",
  confirmedBy: "demo-organizer",
  confirmedAt: "2026-10-21T00:00:00.000Z",
};

function demoSeed(overrides: Partial<ScoringRoundSeed> = {}): ScoringRoundSeed {
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
    rulesVersion: "rules-v1",
    roundStatus: "draft",
    draw: {
      revision: 3,
      published: true,
      groups: [{ number: 1, playerIds: ["p1", "p2"] }],
      liveGroups: [{ number: 1, playerIds: ["p1", "p2"] }],
    },
    ...overrides,
  };
}

/** Runs the demo and the shared assessment on the same seed and returns both sentences. */
async function demoAndAssessedMessages(seed: ScoringRoundSeed, input: OpenRoundInput) {
  const demo = createDemoScoringRepository(seed);
  const snapshot = await demo.loadOpenRoundState(seed.tournamentId);
  const assessment = assessOpenRound(snapshot, input, input.expectedRevision);
  const demoMessage = await messageFrom(demo.openRound(seed.tournamentId, input));
  return { demoMessage, assessmentMessage: assessment.message };
}

describe("demo and database sentences agree", () => {
  it("refuses a draw that moved after it was published", async () => {
    const input: OpenRoundInput = { ...BASE_INPUT, expectedRevision: 3 };
    const seed = demoSeed({
      draw: {
        revision: 3,
        published: true,
        groups: [{ number: 1, playerIds: ["p1", "p2"] }],
        liveGroups: [{ number: 1, playerIds: ["p1"] }],
      },
    });

    const { demoMessage, assessmentMessage } = await demoAndAssessedMessages(seed, input);

    expect(demoMessage).toBe(openRoundErrorMessage("open_round_draw_moved: signature differs"));
    expect(demoMessage).toBe(OPEN_ROUND_MESSAGES.drawMoved);
    expect(demoMessage).toBe(assessmentMessage);
  });

  it("refuses a screen acting on a stale revision", async () => {
    const input: OpenRoundInput = { ...BASE_INPUT, expectedRevision: 2 };

    const { demoMessage, assessmentMessage } = await demoAndAssessedMessages(demoSeed(), input);

    expect(demoMessage).toBe(openRoundErrorMessage("open_round_stale_revision: now revision 3"));
    expect(demoMessage).toBe(OPEN_ROUND_MESSAGES.staleRevision);
    expect(demoMessage).toBe(assessmentMessage);
  });

  it("names the settings that are still missing", async () => {
    const input: OpenRoundInput = {
      ...BASE_INPUT,
      expectedRevision: 3,
      requiredCards: null,
      tieBreakPolicyId: TIE_BREAK.id,
    };
    const seed = demoSeed({ policy: { ...TEST_POLICY, requiredCards: null } });

    const { demoMessage, assessmentMessage } = await demoAndAssessedMessages(seed, input);

    expect(demoMessage).toBe(openRoundErrorMessage("open_round_missing_settings: required cards"));
    expect(demoMessage).toBe(assessmentMessage);
  });
});
