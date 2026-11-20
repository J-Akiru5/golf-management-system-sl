import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { POSITION_STEP } from "@/lib/db/constants";
import type { Database } from "@/lib/db/types";
import {
  type BoardCard,
  createDemoBoardRepo,
  createSupabaseBoardRepo,
  resetDemoBoardRepo,
} from "./repo";

beforeEach(() => {
  resetDemoBoardRepo();
});

function byId(cards: BoardCard[], id: string): BoardCard {
  const found = cards.find((card) => card.id === id);
  if (found === undefined) throw new Error(`missing ${id}`);
  return found;
}

describe("demo board repo", () => {
  it("seeds believable cards across all seven stages", async () => {
    const cards = await createDemoBoardRepo().listCards();
    const stages = new Set(cards.map((card) => card.stage));
    expect(stages.size).toBe(7);
    expect(stages.has("inquiry")).toBe(true);
    expect(stages.has("invoiced_closed")).toBe(true);
    expect(cards.some((card) => card.title === "24th Bamboo Tee")).toBe(true);
  });

  it("filters by owner, unassigned and month", async () => {
    const repo = createDemoBoardRepo();
    const mara = await repo.listCards({ ownerId: "demo-mara" });
    expect(mara.length).toBeGreaterThan(0);
    expect(mara.every((card) => card.owner_id === "demo-mara")).toBe(true);

    const unassigned = await repo.listCards({ ownerId: null });
    expect(unassigned.length).toBe(1);
    expect(unassigned[0]?.owner_id).toBeNull();

    const december = await repo.listCards({ month: "2026-12" });
    expect(december.length).toBeGreaterThan(0);
    expect(december.every((card) => card.start_date?.startsWith("2026-12"))).toBe(true);

    const undated = await repo.listCards({ month: null });
    expect(undated.every((card) => card.start_date === null)).toBe(true);
  });

  it("adds a card at the end of its column", async () => {
    const repo = createDemoBoardRepo();
    const created = await repo.createCard({ title: "  New inquiry  ", clubName: "Test Club" });
    expect(created.title).toBe("New inquiry");
    expect(created.stage).toBe("inquiry");
    expect(created.currency).toBe("PHP");

    const inquiry = (await repo.listCards()).filter((card) => card.stage === "inquiry");
    const highest = Math.max(...inquiry.map((card) => card.position));
    expect(created.position).toBe(highest);
    expect(created.position).toBe(3000);
  });

  it("accepts a starting stage", async () => {
    const repo = createDemoBoardRepo();
    const created = await repo.createCard({
      title: "Confirmed deal",
      clubName: "Somewhere",
      stage: "confirmed",
    });
    expect(created.stage).toBe("confirmed");
  });

  it("rejects an empty title or club instead of guessing one", async () => {
    const repo = createDemoBoardRepo();
    await expect(repo.createCard({ title: "   ", clubName: "Test Club" })).rejects.toThrow(/title/);
    await expect(repo.createCard({ title: "Ok", clubName: "  " })).rejects.toThrow(/club/);
  });

  it("updates a card and stamps a new updated_at", async () => {
    const repo = createDemoBoardRepo();
    const before = byId(await repo.listCards(), "demo-card-01");
    const after = await repo.updateCard("demo-card-01", {
      title: "Cebu invitational",
      quoted_amount: 150000,
    });
    expect(after.title).toBe("Cebu invitational");
    expect(after.quoted_amount).toBe(150000);
    expect(Date.parse(after.updated_at)).toBeGreaterThanOrEqual(Date.parse(before.updated_at));
    expect((await repo.getCard("demo-card-01"))?.title).toBe("Cebu invitational");
  });

  it("moves a card to another stage", async () => {
    const repo = createDemoBoardRepo();
    const moved = await repo.moveCard({ id: "demo-card-01", stage: "live", position: 1500 });
    expect(moved.stage).toBe("live");
    expect(moved.position).toBe(1500);
  });

  it("deletes a card, and reports a card that is already gone", async () => {
    const repo = createDemoBoardRepo();
    await repo.deleteCard("demo-card-01");
    expect(await repo.getCard("demo-card-01")).toBeNull();
    await expect(repo.deleteCard("demo-card-01")).rejects.toThrow(/no longer/);
  });

  it("lists members and tournaments", async () => {
    const repo = createDemoBoardRepo();
    const members = await repo.listMembers();
    expect(members.map((member) => member.user_id)).toContain("demo-user");
    const tournaments = await repo.listTournaments();
    expect(tournaments.length).toBeGreaterThan(0);
    expect(tournaments[0]?.play_date).toBeTruthy();
  });
});

// -------------------------------------------------------------------------------------------------
// A small in-memory stand-in for supabase-js. Only the calls the repo makes are implemented, so the
// test checks the query it builds (filters, created_by, updates) rather than mocking the chain.
// -------------------------------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "is" | "gte" | "lt"; column: string; value: unknown };
type Order = { column: string; ascending: boolean };

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitCount: number | null = null;
  private singleMode: "single" | "maybe" | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
    private readonly mode: "select" | "insert" | "update" | "delete",
    private readonly payload: Row | null = null,
  ) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ kind: "lt", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  maybeSingle(): this {
    this.singleMode = "maybe";
    return this;
  }

  single(): this {
    this.singleMode = "single";
    return this;
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.run(), error: null }).then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      const value = row[filter.column];
      if (filter.kind === "eq") return value === filter.value;
      if (filter.kind === "is")
        return filter.value === null ? value == null : value === filter.value;
      if (filter.kind === "gte") return String(value) >= String(filter.value);
      return String(value) < String(filter.value);
    });
  }

  private sorted(rows: Row[]): Row[] {
    return [...rows].sort((a, b) => {
      for (const order of this.orders) {
        const left = a[order.column];
        const right = b[order.column];
        if (left === right) continue;
        if (typeof left === "number" && typeof right === "number") {
          return order.ascending ? left - right : right - left;
        }
        const result = String(left) < String(right) ? -1 : 1;
        return order.ascending ? result : -result;
      }
      return 0;
    });
  }

  private run(): unknown {
    const rows = this.db.rows(this.table);

    if (this.mode === "insert" && this.payload !== null) {
      const inserted: Row = {
        id: `fake-${rows.length + 1}`,
        currency: "PHP",
        created_at: "2026-11-20T00:00:00.000Z",
        updated_at: "2026-11-20T00:00:00.000Z",
        ...this.payload,
      };
      rows.push(inserted);
      return this.singleMode === null ? [inserted] : inserted;
    }

    if (this.mode === "update" && this.payload !== null) {
      const updated: Row[] = [];
      for (const row of rows) {
        if (!this.matches(row)) continue;
        Object.assign(row, this.payload, { updated_at: "2026-11-20T00:01:00.000Z" });
        updated.push(row);
      }
      return this.singleMode === null ? updated : (updated[0] ?? null);
    }

    if (this.mode === "delete") {
      const kept = rows.filter((row) => !this.matches(row));
      const removed = rows.length - kept.length;
      rows.length = 0;
      rows.push(...kept);
      return removed;
    }

    let selected = this.sorted(rows.filter((row) => this.matches(row)));
    if (this.limitCount !== null) selected = selected.slice(0, this.limitCount);
    if (this.singleMode !== null) return selected[0] ?? null;
    return selected;
  }
}

class FakeDb {
  readonly calls: Array<{ table: string; mode: string; payload: Row | null }> = [];

  constructor(private readonly tables: Record<string, Row[]>) {}

  rows(table: string): Row[] {
    this.tables[table] ??= [];
    const rows = this.tables[table];
    if (rows === undefined) throw new Error(`no table ${table}`);
    return rows;
  }

  client(): SupabaseClient<Database> {
    const db = this;
    const from = (table: string) => {
      const start = (mode: "select" | "insert" | "update" | "delete", payload: Row | null) => {
        db.calls.push({ table, mode, payload });
        return new FakeQuery(db, table, mode, payload);
      };
      return {
        select: () => start("select", null),
        insert: (payload: Row) => start("insert", payload),
        update: (payload: Row) => start("update", payload),
        delete: () => start("delete", null),
      };
    };
    return {
      from,
      auth: {
        getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
      },
    } as unknown as SupabaseClient<Database>;
  }
}

function tournamentRows(): Row[] {
  return [
    { id: "t-1", name: "Bamboo Tee", play_date: "2026-12-12" },
    { id: "t-2", name: "Partner invitational", play_date: "2026-11-20" },
  ];
}

function supabaseDb(): FakeDb {
  return new FakeDb({
    ws_pipeline_cards: [
      {
        id: "card-1",
        title: "Cebu inquiry",
        club_name: "Cebu Country Club",
        stage: "inquiry",
        position: 1000,
        owner_id: "user-2",
        start_date: "2026-12-02",
        currency: "PHP",
        created_by: "user-2",
        created_at: "2026-11-01T00:00:00.000Z",
        updated_at: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "card-2",
        title: "Manila proposal",
        club_name: "Manila Golf",
        stage: "inquiry",
        position: 2000,
        owner_id: null,
        start_date: null,
        currency: "PHP",
        created_by: "user-1",
        created_at: "2026-11-02T00:00:00.000Z",
        updated_at: "2026-11-02T00:00:00.000Z",
      },
    ],
    workspace_members: [
      { user_id: "user-1", display_name: "Ana" },
      { user_id: "user-2", display_name: "Ben" },
    ],
    tournaments: tournamentRows(),
  });
}

describe("supabase board repo", () => {
  it("lists cards and applies the owner filter", async () => {
    const db = supabaseDb();
    const repo = createSupabaseBoardRepo(db.client());
    const all = await repo.listCards();
    expect(all.map((card) => card.id)).toEqual(["card-1", "card-2"]);

    const mine = await repo.listCards({ ownerId: "user-2" });
    expect(mine.map((card) => card.id)).toEqual(["card-1"]);

    const unassigned = await repo.listCards({ ownerId: null });
    expect(unassigned.map((card) => card.id)).toEqual(["card-2"]);
  });

  it("filters a month with a half-open date range", async () => {
    const db = supabaseDb();
    const repo = createSupabaseBoardRepo(db.client());
    const december = await repo.listCards({ month: "2026-12" });
    expect(december.map((card) => card.id)).toEqual(["card-1"]);

    const none = await repo.listCards({ month: null });
    expect(none.map((card) => card.id)).toEqual(["card-2"]);
  });

  it("creates a card at the end of the column as the signed-in user", async () => {
    const db = supabaseDb();
    const repo = createSupabaseBoardRepo(db.client());
    const card = await repo.createCard({ title: "New lead", clubName: "Somewhere" });
    expect(card.stage).toBe("inquiry");
    expect(card.position).toBe(3000);
    expect(card.created_by).toBe("user-1");
    expect(card.title).toBe("New lead");
  });

  it("moves a card by writing the stage and position", async () => {
    const db = supabaseDb();
    const repo = createSupabaseBoardRepo(db.client());
    const moved = await repo.moveCard({ id: "card-1", stage: "prep", position: 500 });
    expect(moved.stage).toBe("prep");
    expect(moved.position).toBe(500);
    expect(db.calls.some((call) => call.mode === "update")).toBe(true);
  });

  it("deletes a card by id", async () => {
    const db = supabaseDb();
    const repo = createSupabaseBoardRepo(db.client());
    await repo.deleteCard("card-2");
    expect(await repo.getCard("card-2")).toBeNull();
    expect(db.calls.some((call) => call.mode === "delete")).toBe(true);
  });

  it("lists members and tournaments", async () => {
    const db = supabaseDb();
    const repo = createSupabaseBoardRepo(db.client());
    expect(await repo.listMembers()).toEqual([
      { user_id: "user-1", display_name: "Ana" },
      { user_id: "user-2", display_name: "Ben" },
    ]);

    const tournaments = await repo.listTournaments();
    // Most recent play date first.
    expect(tournaments).toEqual([
      { id: "t-1", name: "Bamboo Tee", play_date: "2026-12-12" },
      { id: "t-2", name: "Partner invitational", play_date: "2026-11-20" },
    ]);
  });
});
