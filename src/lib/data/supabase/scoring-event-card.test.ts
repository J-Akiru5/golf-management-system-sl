import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { CardEntry } from "@/lib/scoring";
import { TEST_HOLES, TEST_TEE } from "@/lib/scoring/__tests__/fixtures";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseScoringRepository } from "./scoring";

type Row = Record<string, unknown>;

interface Chain {
  select: () => Chain;
  eq: () => Chain;
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

/**
 * A small stateful stand-in for the database. It keeps the rows the repository reads, and the three
 * workflow functions this path calls write to them the way the real functions do, so the round view
 * the repository builds afterwards is the one a real round would give.
 */
function fakeDatabase(options: { missingSnapshotFunction?: boolean } = {}) {
  const state: Record<string, Row[]> = {
    tournaments: [{ id: "t1", club_id: "club-1", course_id: "course-1" }],
    competition_rounds: [
      {
        id: "round-1",
        tournament_id: "t1",
        day_number: 3,
        status: "open",
        required_cards: 1,
        allow_provisional_single_card: false,
        min_ocr_confidence: 0.85,
        stroke_min: 1,
        stroke_max: 20,
        tie_break_policy_id: null,
        finalization_authority: "organizer",
        rules_version: "bamboo-tee-2026",
        provisional_publication: "off",
      },
    ],
    round_entries: ["p1", "p2", "p3"].map((id) => ({
      id: `entry-${id}`,
      round_id: "round-1",
      registration_id: `reg-${id}`,
      status: "active",
      flight_id: null,
    })),
    registrations: ["p1", "p2", "p3"].map((id) => ({
      id: `reg-${id}`,
      player_id: id,
      frozen_index: 12,
    })),
    players: [
      { id: "p1", full_name: "Alpha One" },
      { id: "p2", full_name: "Bravo Two" },
      { id: "p3", full_name: "Charlie Three" },
    ],
    holes: TEST_HOLES.map((hole) => ({
      number: hole.number,
      par: hole.par,
      stroke_index: hole.strokeIndex,
    })),
    tees: [
      {
        id: TEST_TEE.id,
        name: TEST_TEE.name,
        course_rating: TEST_TEE.courseRating,
        slope: TEST_TEE.slope,
        par: TEST_TEE.par,
      },
    ],
    handicap_snapshots: [
      {
        round_entry_id: "entry-p1",
        // The WHS snapshot the round was opened with: index 30 plays off 33 on the test tee.
        handicap_index: 30,
        index_source: "Registration freeze",
        index_effective_date: "2026-11-14",
        tee_id: TEST_TEE.id,
        course_rating: TEST_TEE.courseRating,
        slope: TEST_TEE.slope,
        course_par: TEST_TEE.par,
        allowance: 1,
        rounding: "whs",
        course_handicap: 33,
        playing_handicap: 33,
        rules_version: "bamboo-tee-2026",
      },
    ],
    scorecards: [],
    scorecard_entries: [],
    scorecard_images: [],
    hole_resolutions: [],
    round_publications: [],
  };
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];

  function query(table: string): Chain {
    const chain: Chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: state[table]?.[0] ?? null, error: null }),
      then: (resolve, reject) =>
        Promise.resolve({ data: state[table] ?? [], error: null }).then(resolve, reject),
    };
    return chain;
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === "save_card_handicap_snapshot") {
      if (options.missingSnapshotFunction) {
        return {
          data: null,
          error: {
            message:
              "Could not find the function public.save_card_handicap_snapshot(p_card_handicap, p_round_entry) in the schema cache",
          },
        };
      }
      const text = String(args.p_card_handicap ?? "").trim();
      const value = text === "" ? 0 : Number(text);
      const playing = Math.floor(value);
      state.handicap_snapshots = [
        ...(state.handicap_snapshots ?? []).filter(
          (row) => row.round_entry_id !== args.p_round_entry,
        ),
        {
          round_entry_id: args.p_round_entry,
          handicap_index: Math.floor(value * 10) / 10,
          index_source: "Scorecard HDCP box",
          index_effective_date: "2026-11-14",
          tee_id: TEST_TEE.id,
          course_rating: TEST_TEE.courseRating,
          slope: TEST_TEE.slope,
          course_par: TEST_TEE.par,
          allowance: 1,
          rounding: "single",
          course_handicap: playing,
          playing_handicap: playing,
          rules_version: "bamboo-tee-2026",
        },
      ];
      return { data: "snapshot-1", error: null };
    }
    if (name === "submit_scorecard") {
      const entry = (state.round_entries ?? []).find((row) => row.id === args.p_round_entry);
      const registration = (state.registrations ?? []).find(
        (row) => row.id === entry?.registration_id,
      );
      const id = `card-${(state.scorecards ?? []).length + 1}`;
      state.scorecards = [
        ...(state.scorecards ?? []),
        {
          id,
          round_id: "round-1",
          player_id: registration?.player_id,
          scorer_id: args.p_scorer_id,
          source: args.p_source,
          revision: 1,
          status: "submitted",
          written_total: args.p_written_total ?? null,
          submitted_at: "2026-11-14T08:00:00.000Z",
        },
      ];
      for (const raw of args.p_entries as Array<Record<string, unknown>>) {
        state.scorecard_entries = [
          ...(state.scorecard_entries ?? []),
          {
            scorecard_id: id,
            hole_number: raw.hole,
            strokes: raw.strokes ?? null,
            picked_up: raw.picked_up === true,
            confidence: raw.confidence ?? null,
            manually_confirmed: raw.manually_confirmed === true,
          },
        ];
      }
      return { data: id, error: null };
    }
    if (name === "approve_scorecard") {
      state.scorecards = (state.scorecards ?? []).map((row) =>
        row.id === args.p_card ? { ...row, status: "approved" } : row,
      );
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  const client = {
    from: (table: string) => query(table),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc,
  };
  return { client: client as unknown as SupabaseClient<Database>, calls, state };
}

/** The 16.7 card with one X, the same card the demo repository's hand calculation uses. */
const CELLS = [
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

const ENTRIES: CardEntry[] = CELLS.map((cell, index) =>
  cell === "X"
    ? { hole: index + 1, strokes: null, pickedUp: true, confidence: null, manuallyConfirmed: true }
    : { hole: index + 1, strokes: Number(cell), confidence: null, manuallyConfirmed: true },
);

function input(overrides: Record<string, unknown> = {}) {
  return {
    playerId: "p1",
    entries: ENTRIES,
    cardHandicap: "16.7",
    writtenTotal: null,
    captureKey: "key-1",
    approve: true,
    ...overrides,
  };
}

describe("the connected repository saving a card under the event rules", () => {
  it("writes the card handicap, then the card, then the approval, and scores to the hand calculation", async () => {
    const { client, calls } = fakeDatabase();
    const repo = createSupabaseScoringRepository({ client: client as never });

    const { view, outcome } = await repo.saveEventCard("t1", input(), 3);

    expect(outcome).toBe("approved");
    expect(calls.map((call) => call.name)).toEqual([
      "save_card_handicap_snapshot",
      "submit_scorecard",
      "approve_scorecard",
    ]);
    expect(calls[0]?.args).toEqual({ p_round_entry: "entry-p1", p_card_handicap: "16.7" });
    // The stored marker is a different player in the round, the same one every time.
    expect(calls[1]?.args).toMatchObject({ p_round_entry: "entry-p1", p_scorer_id: "p2" });
    // The approval carries the audit sentence.
    expect(calls[2]?.args.p_reason).toContain("bamboo-tee-2026");
    expect(calls[2]?.args.p_reason).toContain("plays off 16");

    const alpha = view.players.find((player) => player.playerId === "p1");
    expect(alpha?.handicap).toMatchObject({ rounding: "card", playingHandicap: 16, index: 16.7 });
    const row = view.standings.net.rows.find((candidate) => candidate.playerId === "p1");
    expect(row).toMatchObject({ netPoints: 46, grossPoints: 31, grossStrokes: 73 });
  });

  it("does not write the same card twice", async () => {
    const { client, calls } = fakeDatabase();
    const repo = createSupabaseScoringRepository({ client: client as never });
    await repo.saveEventCard("t1", input(), 3);
    const before = calls.length;

    const again = await repo.saveEventCard("t1", input({ captureKey: "key-again" }), 3);

    expect(again.outcome).toBe("already_in");
    // No second snapshot, card or approval: only reads happened.
    expect(calls.length).toBe(before);
  });

  it("says plainly when the database function has not been applied, and writes no card", async () => {
    const { client, calls } = fakeDatabase({ missingSnapshotFunction: true });
    const repo = createSupabaseScoringRepository({ client: client as never });

    await expect(repo.saveEventCard("t1", input(), 3)).rejects.toThrow(
      "20261114000100_card_handicap_snapshot.sql",
    );
    expect(calls.map((call) => call.name)).toEqual(["save_card_handicap_snapshot"]);
  });

  it("refuses a round on the ordinary rules before it writes anything", async () => {
    const { client, calls, state } = fakeDatabase();
    const first = state.competition_rounds?.[0];
    if (first) first.rules_version = "rules-v1";
    const repo = createSupabaseScoringRepository({ client: client as never });

    await expect(repo.saveEventCard("t1", input(), 3)).rejects.toThrow(
      "not on the event's card rules",
    );
    expect(calls).toEqual([]);
  });
});
