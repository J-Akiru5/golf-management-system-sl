import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseScoringRepository } from "./scoring";

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

const HOLES: Row[] = Array.from({ length: 18 }, (_, index) => ({
  number: index + 1,
  par: index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5,
  stroke_index: index + 1,
}));

const TEE: Row = {
  id: "tee-white",
  name: "White",
  course_rating: 71.5,
  slope: 128,
  par: 72,
};

const TOURNAMENT: Row = { id: "t1", club_id: "club-1", course_id: "course-1" };

function round(id: string, day: number, status: string): Row {
  return {
    id,
    tournament_id: "t1",
    day_number: day,
    status,
    required_cards: 2,
    allow_provisional_single_card: true,
    min_ocr_confidence: 0.85,
    tie_break_policy_id: null,
    finalization_authority: "organizer",
    rules_version: "rules-v1",
    provisional_publication: "verified_holes",
  };
}

const ROUNDS = [round("round-1", 1, "draft"), round("round-3", 3, "open")];

const ROUND_ENTRIES: Row[] = [
  {
    id: "entry-day-1",
    round_id: "round-1",
    registration_id: "reg-1",
    status: "active",
    flight_id: null,
  },
  {
    id: "entry-day-3",
    round_id: "round-3",
    registration_id: "reg-1",
    status: "active",
    flight_id: null,
  },
];

const REGISTRATIONS: Row[] = [{ id: "reg-1", player_id: "p1", frozen_index: 10 }];
const PLAYERS: Row[] = [{ id: "p1", full_name: "Alpha One" }];

function fakeClient() {
  const dayFilters: Array<{ table: string; column: string; value: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  function rowsFor(table: string, filters: Record<string, unknown>): Row[] {
    const match = (row: Row) =>
      Object.entries(filters).every(([column, value]) => row[column] === value);
    switch (table) {
      case "competition_rounds":
        return ROUNDS.filter(match);
      case "round_entries":
        return ROUND_ENTRIES.filter(match);
      case "registrations":
        return REGISTRATIONS;
      case "players":
        return PLAYERS;
      case "holes":
        return HOLES;
      case "tees":
        return [TEE];
      default:
        return [];
    }
  }

  function query(table: string): Chain {
    const filters: Record<string, unknown> = {};
    const chain: Chain = {
      select: () => chain,
      eq: (column, value) => {
        filters[column] = value;
        dayFilters.push({ table, column, value });
        return chain;
      },
      in: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === "tournaments") return { data: TOURNAMENT, error: null };
        if (table === "competition_rounds") {
          const rows = [...rowsFor(table, filters)].sort(
            (a, b) => Number(a.day_number) - Number(b.day_number),
          );
          return { data: rows[0] ?? null, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve, reject) =>
        Promise.resolve({ data: rowsFor(table, filters), error: null }).then(resolve, reject),
    };
    return chain;
  }

  const client = {
    from: (table: string) => query(table),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: "card-1", error: null };
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    dayFilters,
    rpcCalls,
  };
}

const CARD = {
  playerId: "p1",
  scorerId: "p2",
  source: "manual" as const,
  entries: HOLES.map((hole) => ({
    hole: Number(hole.number),
    strokes: Number(hole.par),
    confidence: null,
    manuallyConfirmed: true,
  })),
  writtenTotal: 72,
  captureKey: "capture-day-3",
};

describe("day-aware scoring repository", () => {
  it("loads the round for the named day, not the earliest round", async () => {
    const fake = fakeClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    const view = await repo.loadRound("t1", 3);

    expect(view?.roundId).toBe("round-3");
    expect(fake.dayFilters).toContainEqual({
      table: "competition_rounds",
      column: "day_number",
      value: 3,
    });
  });

  it("keeps the earliest round only when the caller names no day", async () => {
    const fake = fakeClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    const view = await repo.loadRound("t1");

    expect(view?.roundId).toBe("round-1");
  });

  it("shows the named day's round status in the setup panel", async () => {
    const fake = fakeClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    await expect(repo.loadOpenRoundState("t1", 3)).resolves.toMatchObject({ roundStatus: "open" });
    await expect(repo.loadOpenRoundState("t1")).resolves.toMatchObject({ roundStatus: "draft" });
  });

  it("writes a day-3 card to the day-3 round entry", async () => {
    const fake = fakeClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    const view = await repo.submitCard("t1", CARD, 3);

    expect(view.roundId).toBe("round-3");
    const submitted = fake.rpcCalls.find((call) => call.name === "submit_scorecard");
    expect(submitted?.args).toMatchObject({ p_round_entry: "entry-day-3" });
  });

  it("writes a day-1 card to the day-1 round entry", async () => {
    const fake = fakeClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    await repo.submitCard("t1", CARD, 1);

    const submitted = fake.rpcCalls.find((call) => call.name === "submit_scorecard");
    expect(submitted?.args).toMatchObject({ p_round_entry: "entry-day-1" });
  });
});
