import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { NewEntryInput } from "@/lib/data/adapters";
import type { RegistrationEntry } from "@/lib/data/types";
import { type Action, type DeskState, initialState } from "@/lib/store/state";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseAdapters } from "./adapters";

const input: NewEntryInput = {
  playerId: "",
  role: "member",
  sponsor: null,
  shirt: null,
  teePreferences: {},
  selectedDays: [1, 2],
  declaredWshId: null,
  declaredWshHandicap: null,
  extra: {},
  paymentStatus: "not_recorded",
};

/** The connected adapter's `add`, with one scripted answer from the database. */
function harness(answer: { data: unknown; error: { message: string } | null }) {
  const calls: { fn: string; payload: Record<string, unknown> }[] = [];
  const actions: Action[] = [];
  const state: DeskState = initialState();
  const tournament = state.tournaments[0];
  const player = state.players[0];
  if (!tournament || !player) throw new Error("the demo has an event and a player");

  const client = {
    rpc: async (fn: string, payload: Record<string, unknown>) => {
      calls.push({ fn, payload });
      return answer;
    },
  } as unknown as SupabaseClient<Database>;

  const adapters = createSupabaseAdapters(state, (a) => actions.push(a), {
    client,
    clubId: state.clubId,
    revisions: { get: () => null, set: () => {} },
    canWrite: () => true,
    onError: () => {},
    onSaved: () => {},
    onBusy: () => {},
  });

  const add = () => {
    const entry = adapters.registrations.add(tournament.id, { ...input, playerId: player.id });
    // The connected adapter attaches its write; the repository type only promises the entry.
    const saved = (entry as RegistrationEntry & { saved?: Promise<void> }).saved;
    if (!saved) throw new Error("the connected adapter must hand back its write");
    return { entry, saved };
  };

  return { add, calls, actions, tournament };
}

describe("registrations.add on the club database", () => {
  it("writes the entry and its days in one function call", async () => {
    const h = harness({ data: { ok: true, id: "e-1" }, error: null });
    const { entry, saved } = h.add();
    await saved;

    expect(h.calls.map((c) => c.fn)).toEqual(["create_registration"]);
    expect(h.calls[0]?.payload.p_tournament).toBe(h.tournament.id);
    expect(h.calls[0]?.payload.p_player).toBe(entry.playerId);
    expect(h.calls[0]?.payload.p_days).toEqual([1, 2]);
    expect(h.actions.map((a) => a.type)).toEqual(["addEntry"]);
  });

  it("takes the optimistic entry off the screen and rejects when the database refuses", async () => {
    const h = harness({
      data: { ok: false, message: "This event requires exactly 2 playing day(s)." },
      error: null,
    });
    const { entry, saved } = h.add();

    await expect(saved).rejects.toThrow(/exactly 2 playing day/);
    expect(h.actions.map((a) => a.type)).toEqual(["addEntry", "removeEntry"]);
    expect(h.actions[1]).toMatchObject({ type: "removeEntry", id: entry.id });
  });
});
