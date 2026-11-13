import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseScoringRepository } from "./scoring";

type Row = Record<string, unknown>;

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: readonly unknown[] };

interface Query {
  table: string;
  columns: string | null;
  filters: Filter[];
}

interface Chain {
  select: (columns?: string) => Chain;
  eq: (column: string, value: unknown) => Chain;
  in: (column: string, values: readonly unknown[]) => Chain;
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
  course_id: "course-1",
}));

const TEE: Row = {
  id: "tee-white",
  name: "White",
  course_rating: 71.5,
  slope: 128,
  par: 72,
  course_id: "course-1",
};

const TOURNAMENT: Row = { id: "t1", club_id: "club-1", course_id: "course-1" };

const ROUND: Row = {
  id: "round-1",
  tournament_id: "t1",
  day_number: 1,
  status: "scoring",
  required_cards: 2,
  allow_provisional_single_card: true,
  min_ocr_confidence: 0.85,
  tie_break_policy_id: null,
  finalization_authority: "organizer",
  rules_version: "rules-v1",
  provisional_publication: "verified_holes",
};

function entry(id: string, registrationId: string, flightId: string | null): Row {
  return {
    id,
    round_id: "round-1",
    registration_id: registrationId,
    status: "active",
    flight_id: flightId,
  };
}

const ROUND_ENTRIES: Row[] = [
  entry("entry-a", "reg-a", "flight-a"),
  entry("entry-b", "reg-b", null),
  entry("entry-c", "reg-c", "flight-gone"),
];

const REGISTRATIONS: Row[] = [
  { id: "reg-a", player_id: "p1", frozen_index: 10 },
  { id: "reg-b", player_id: "p2", frozen_index: 12 },
  { id: "reg-c", player_id: "p3", frozen_index: 14 },
];

const PLAYERS: Row[] = [
  { id: "p1", full_name: "Alpha One" },
  { id: "p2", full_name: "Bravo Two" },
  { id: "p3", full_name: "Charlie Three" },
];

// One class row. "flight-gone" has no row, which models a flight id the loader cannot name.
const FLIGHTS: Row[] = [{ id: "flight-a", club_id: "club-1", name: "Class A" }];

function matches(row: Row, filters: readonly Filter[]): boolean {
  return filters.every((filter) =>
    filter.kind === "eq"
      ? row[filter.column] === filter.value
      : filter.values.includes(row[filter.column]),
  );
}

function fakeClient() {
  const queries: Query[] = [];

  function rowsFor(table: string, filters: readonly Filter[]): Row[] {
    const rows = (() => {
      switch (table) {
        case "competition_rounds":
          return [ROUND];
        case "round_entries":
          return ROUND_ENTRIES;
        case "registrations":
          return REGISTRATIONS;
        case "players":
          return PLAYERS;
        case "flights":
          return FLIGHTS;
        case "holes":
          return HOLES;
        case "tees":
          return [TEE];
        default:
          return [];
      }
    })();
    return rows.filter((row) => matches(row, filters));
  }

  function query(table: string): Chain {
    const record: Query = { table, columns: null, filters: [] };
    queries.push(record);
    const chain: Chain = {
      select: (columns) => {
        record.columns = columns ?? null;
        return chain;
      },
      eq: (column, value) => {
        record.filters.push({ kind: "eq", column, value });
        return chain;
      },
      in: (column, values) => {
        record.filters.push({ kind: "in", column, values });
        return chain;
      },
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === "tournaments") return { data: TOURNAMENT, error: null };
        return { data: rowsFor(table, record.filters)[0] ?? null, error: null };
      },
      then: (resolve, reject) =>
        Promise.resolve({ data: rowsFor(table, record.filters), error: null }).then(
          resolve,
          reject,
        ),
    };
    return chain;
  }

  const client = {
    from: (table: string) => query(table),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
  };

  return { client: client as unknown as SupabaseClient<Database>, queries };
}

describe("scoring classes", () => {
  it("loads the class name beside each player", async () => {
    const fake = fakeClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    const view = await repo.loadRound("t1");
    const byPlayer = new Map((view?.players ?? []).map((player) => [player.playerId, player]));

    expect(byPlayer.get("p1")?.flightName).toBe("Class A");
    expect(byPlayer.get("p2")?.flightName).toBeNull();
    expect(byPlayer.get("p3")?.flightName).toBeNull();
  });

  it("never puts a raw flight id where the class name goes", async () => {
    const fake = fakeClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    const view = await repo.loadRound("t1");
    const byPlayer = new Map((view?.players ?? []).map((player) => [player.playerId, player]));

    expect(byPlayer.get("p3")?.flightName).not.toBe("flight-gone");
    expect(byPlayer.get("p1")?.flightName).not.toBe("flight-a");
  });

  it("reads the class names in one club-scoped query", async () => {
    const fake = fakeClient();
    const repo = createSupabaseScoringRepository({ client: fake.client });

    await repo.loadRound("t1");

    const flightQueries = fake.queries.filter((query) => query.table === "flights");
    expect(flightQueries).toHaveLength(1);
    expect(flightQueries[0]?.columns).toBe("id, name");
    expect(flightQueries[0]?.filters).toContainEqual({
      kind: "eq",
      column: "club_id",
      value: "club-1",
    });
    expect(flightQueries[0]?.filters).toContainEqual({
      kind: "in",
      column: "id",
      values: ["flight-a", "flight-gone"],
    });
  });
});
