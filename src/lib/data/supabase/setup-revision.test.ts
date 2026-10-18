import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseAdapters, type RevisionStore } from "@/lib/data/supabase/adapters";
import { initialState } from "@/lib/store/state";
import type { Database } from "@/lib/supabase/types";

/**
 * `save_event_setup` and `save_draw` both read and bump `tournaments.draw_revision`, and both refuse
 * a write naming a stale one. These tests pin the part that was wrong: the two writes have to share
 * one number. The adapter used to close over a counter of its own while the desk kept another, so a
 * setup save silently invalidated the draw's.
 */

const state = initialState();
const tournament = state.tournaments[0]!;

function fakeClient(reply: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(reply);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

/** The desk's real store, in miniature: one number per tournament, shared by both writers. */
function sharedStore(initial: Record<string, number> = {}) {
  const values = { ...initial };
  const store: RevisionStore = {
    get: (tournamentId) => values[tournamentId] ?? null,
    set: (tournamentId, revision) => {
      values[tournamentId] = revision;
    },
  };
  return { store, values };
}

const options = (client: SupabaseClient<Database>, revisions: RevisionStore) => ({
  client,
  clubId: state.clubId,
  revisions,
  onError: vi.fn(),
  onSaved: vi.fn(),
  onBusy: vi.fn(),
});

const setUp = (
  reply: { data: unknown; error: { message: string } | null },
  initial?: Record<string, number>,
) => {
  const { client, rpc } = fakeClient(reply);
  const { store, values } = sharedStore(initial);
  const adapters = createSupabaseAdapters(state, vi.fn(), options(client, store));
  return { adapters, rpc, store, values };
};

const save = (adapters: ReturnType<typeof setUp>["adapters"]) =>
  adapters.setup.save({ tournament, tees: [], holes: [], sections: "all" });

/** The write is queued; wait for it to have run. */
const flush = async (assertion: () => void) => {
  await vi.waitFor(assertion, { timeout: 2000 });
};

describe("event setup saves", () => {
  it("names the revision the desk last saw", async () => {
    const { adapters, rpc } = setUp(
      { data: { ok: true, revision: 7 }, error: null },
      { [tournament.id]: 4 },
    );
    save(adapters);
    await flush(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0]?.[0]).toBe("save_event_setup");
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_expected_revision: 4 });
  });

  it("is unguarded when the desk has never seen a revision, which is a first save", async () => {
    const { adapters, rpc } = setUp({ data: { ok: true, revision: 1 }, error: null });
    save(adapters);
    await flush(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_expected_revision: null });
  });

  it("records the new revision in the shared store, not in a counter of its own", async () => {
    const { adapters, store } = setUp(
      { data: { ok: true, revision: 7 }, error: null },
      { [tournament.id]: 4 },
    );
    expect(store.get(tournament.id)).toBe(4);
    save(adapters);
    await flush(() => expect(store.get(tournament.id)).toBe(7));
    // This is the bug: before, the number lived inside the adapter and the draw never heard about it.
    expect(store.get(tournament.id)).toBe(7);
  });

  it("hands the draw the revision the setup save just produced, so the next write is not refused", async () => {
    const { adapters, store } = setUp(
      { data: { ok: true, revision: 7 }, error: null },
      { [tournament.id]: 4 },
    );
    save(adapters);
    await flush(() => expect(store.get(tournament.id)).toBe(7));

    // What the draw path does: read the same store and name it.
    const nextWriteNames = store.get(tournament.id) ?? 0;
    expect(nextWriteNames).toBe(7);
    expect(nextWriteNames).not.toBe(4);
  });

  it("reads the revision when the write runs, not when it was queued", async () => {
    const { adapters, rpc, store } = setUp(
      { data: { ok: true, revision: 9 }, error: null },
      { [tournament.id]: 4 },
    );
    save(adapters);
    // Something else confirmed a newer revision before the queued write reached the database.
    store.set(tournament.id, 8);
    await flush(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_expected_revision: 8 });
  });

  it("leaves the revision alone when the database does not return one", async () => {
    const { adapters, store } = setUp({ data: { ok: true }, error: null }, { [tournament.id]: 4 });
    save(adapters);
    await flush(() => expect(store.get(tournament.id)).toBe(4));
    expect(store.get(tournament.id)).toBe(4);
  });

  it("keeps each tournament's revision apart", async () => {
    const other = state.tournaments[1];
    if (!other) return;
    const { adapters, store } = setUp(
      { data: { ok: true, revision: 7 }, error: null },
      { [tournament.id]: 4, [other.id]: 11 },
    );
    save(adapters);
    await flush(() => expect(store.get(tournament.id)).toBe(7));
    expect(store.get(other.id)).toBe(11);
  });
});
