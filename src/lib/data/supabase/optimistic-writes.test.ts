import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createMockAdapters, type OverrideReadyInput } from "@/lib/data/adapters";
import type { RegistrationEntry, Tournament } from "@/lib/data/types";
import { type Action, type DeskState, initialState, reducer } from "@/lib/store/state";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseAdapters } from "./adapters";

/**
 * A desk without React.
 *
 * The provider keeps the newest state behind `latest.current`, updates it in the same call that
 * dispatches (before React renders), and lets the adapters read it. This harness mirrors that with
 * a mutable `current` applied through the real reducer, and adds a fake database whose writes are
 * answered only when the test says so.
 */
function connectedDesk(seed: DeskState, options: { canWrite?: () => boolean } = {}) {
  let current = seed;
  const actions: Action[] = [];
  const errors: string[] = [];
  const pending: Pending[] = [];
  const revisions: Record<string, number> = {};

  const dispatch = (action: Action) => {
    actions.push(action);
    current = reducer(current, action);
  };

  const answerLater = (kind: Pending["kind"], target: string, payload: unknown) => {
    const said = deferred<Answer>();
    pending.push({
      kind,
      target,
      payload,
      answer: (error) =>
        said.resolve({
          data: { ok: true, revision: 7 },
          error: error ? { message: error } : null,
        }),
    });
    return said.promise;
  };

  const client = {
    from: (table: string) => ({
      ...emptyRead(),
      update: (payload: unknown) => ({
        eq: () => ({ eq: () => answerLater("update", table, payload) }),
      }),
    }),
    rpc: (fn: string, payload: unknown) => answerLater("rpc", fn, payload),
  } as unknown as SupabaseClient<Database>;

  const adapters = createSupabaseAdapters(seed, dispatch, {
    client,
    clubId: seed.clubId,
    revisions: {
      get: (id) => revisions[id] ?? null,
      set: (id, revision) => {
        revisions[id] = revision;
      },
    },
    currentState: () => current,
    canWrite: options.canWrite ?? (() => true),
    onError: (message) => errors.push(message),
    onSaved: () => {},
    onBusy: () => {},
  });

  /**
   * Lets the queue start, finish, or move on to its next job. The queue is a plain promise chain,
   * so a handful of microtask turns is enough and no timers are involved.
   */
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };

  return { adapters, actions, errors, pending, settle, state: () => current };
}

interface Answer {
  data?: unknown;
  error: { message: string } | null;
}

/**
 * A read the harness answers with no rows.
 *
 * An index edit now reads the event's rounds before it decides whether a played round has to be
 * corrected. These tests are about the writes, and this player has no scored round, so every read
 * comes back empty.
 */
interface ReadChain {
  select: () => ReadChain;
  eq: () => ReadChain;
  in: () => ReadChain;
  order: () => ReadChain;
  then: (
    resolve: (value: { data: never[]; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

function emptyRead(): ReadChain {
  const chain: ReadChain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  return chain;
}

interface Pending {
  kind: "update" | "rpc";
  target: string;
  payload: unknown;
  /** Answer the write. No argument means the database accepted it. */
  answer: (error?: string) => void;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** The in-memory adapters with no database at all, for the demo behaviour that must not change. */
function demoDesk(seed: DeskState) {
  let current = seed;
  const dispatch = (action: Action) => {
    current = reducer(current, action);
  };
  return { adapters: createMockAdapters(current, dispatch), state: () => current };
}

const firstEntry = (state: DeskState): RegistrationEntry => {
  const entry = state.entries[0];
  if (!entry) throw new Error("the demo has a registration");
  return entry;
};

const firstTournament = (state: DeskState): Tournament => {
  const tournament = state.tournaments[0];
  if (!tournament) throw new Error("the demo has an event");
  return tournament;
};

const overrideInput = (state: DeskState): OverrideReadyInput => {
  const tournament = firstTournament(state);
  return {
    index: 12.4,
    effectiveDate: "2026-11-01",
    birthdate: null,
    categoryId: tournament.categories[0]?.id ?? null,
    teeId: state.tees[0]?.id ?? null,
    flightId: tournament.flights[0]?.id ?? null,
    playingHandicap: 11,
    reason: "Organizer confirmed the index from the printed card.",
    pending: [],
  };
};

const entryById = (state: DeskState, id: string) => state.entries.find((e) => e.id === id);
const tournamentById = (state: DeskState, id: string) => state.tournaments.find((t) => t.id === id);

/**
 * The demo seed with two of its entries made a pair: one on a low index, one on a high index. Their
 * average is Class B, so a stored Class D can only come from the pair's saved class.
 */
function pairedSeed() {
  const seed = initialState();
  const [member, partner] = seed.entries.filter((e) => !e.overridden);
  if (!member || !partner) throw new Error("the demo has two entries");
  const state: DeskState = {
    ...seed,
    entries: seed.entries.map((e) =>
      e.id === member.id
        ? { ...e, teamNo: 4, frozen: { ...e.frozen, index: 2 } }
        : e.id === partner.id
          ? { ...e, teamNo: 4, frozen: { ...e.frozen, index: 27 } }
          : e,
    ),
  };
  return { state, member, partner };
}

describe("a registration edit while connected", () => {
  it("shows the change at once and keeps it when the database accepts it", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = connectedDesk(seed);

    const write = h.adapters.registrations.update(entry.id, { paymentStatus: "recorded_paid" });
    // The inline control answers the tap before the database has spoken.
    expect(entryById(h.state(), entry.id)?.paymentStatus).toBe("recorded_paid");
    await h.settle();
    expect(h.pending).toHaveLength(1);

    h.pending[0]?.answer();
    await write;
    await h.settle();
    expect(entryById(h.state(), entry.id)?.paymentStatus).toBe("recorded_paid");
    expect(h.errors).toEqual([]);
  });

  it("puts the previous value back when the database refuses it", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = connectedDesk(seed);

    const write = h.adapters.registrations.update(entry.id, { paymentStatus: "recorded_paid" });
    await h.settle();
    h.pending[0]?.answer("new row violates row-level security policy");
    await expect(write).rejects.toThrow(/Could not save the registration/);
    await h.settle();

    expect(entryById(h.state(), entry.id)?.paymentStatus).toBe(entry.paymentStatus);
    expect(h.errors[0]).toMatch(/row-level security policy/);
  });

  it("puts the previous value back when the desk cannot write at all", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = connectedDesk(seed, { canWrite: () => false });

    const write = h.adapters.registrations.update(entry.id, { paymentStatus: "recorded_paid" });
    // The refusal happens before the queue starts, so nothing is sent.
    await Promise.resolve(write).catch(() => undefined);
    await h.settle();
    expect(h.pending).toEqual([]);
    expect(entryById(h.state(), entry.id)?.paymentStatus).toBe(entry.paymentStatus);
    expect(h.errors[0]).toMatch(/offline, so this change was not saved/);
  });

  it("does not erase a later edit when the first write is refused", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = connectedDesk(seed);

    const first = h.adapters.registrations.update(entry.id, { paymentStatus: "recorded_paid" });
    const second = h.adapters.registrations.update(entry.id, { shirt: "Medium" });
    await h.settle();
    // One write at a time: the second is still queued.
    expect(h.pending).toHaveLength(1);

    h.pending[0]?.answer("The payment status was refused.");
    await expect(first).rejects.toThrow(/payment status was refused/);
    await h.settle();
    expect(h.pending).toHaveLength(2);

    h.pending[1]?.answer();
    await second;
    await h.settle();

    const after = entryById(h.state(), entry.id);
    expect(after?.shirt).toBe("Medium");
    expect(after?.paymentStatus).toBe(entry.paymentStatus);
    // The second write carried the rolled-back value, so the row on file matches the screen.
    const expected =
      entry.paymentStatus === "recorded_paid"
        ? "paid"
        : entry.paymentStatus === "waived"
          ? "waived"
          : "unpaid";
    expect((h.pending[1]?.payload as { payment_status: string }).payment_status).toBe(expected);
  });
});

describe("a manual override while connected", () => {
  it("shows nothing until the row is written, then shows the player as ready", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const input = overrideInput(seed);
    const h = connectedDesk(seed);

    const write = h.adapters.registrations.overrideReady(entry.id, input);
    await h.settle();
    expect(h.pending).toHaveLength(1);
    // Still in review: the screen must not claim what the database has not accepted.
    expect(entryById(h.state(), entry.id)?.status).not.toBe("ok");
    expect(h.actions.some((a) => a.type === "updateEntry")).toBe(false);

    h.pending[0]?.answer();
    await write;
    await h.settle();

    const after = entryById(h.state(), entry.id);
    expect(after?.status).toBe("ok");
    expect(after?.overridden).toBe(true);
    expect(after?.playingHandicap).toBe(11);
    expect(after?.overrideReason).toBe(input.reason);
    // The reason travels in the answers document, not only on the screen.
    expect(
      (h.pending[0]?.payload as { answers: { overrideReason: string } }).answers.overrideReason,
    ).toBe(input.reason);
    expect(h.errors).toEqual([]);
  });

  it("leaves the player in review when the database refuses", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = connectedDesk(seed);

    const write = h.adapters.registrations.overrideReady(entry.id, overrideInput(seed));
    await h.settle();
    h.pending[0]?.answer("Only the owner or an organizer can mark a player ready");
    await expect(write).rejects.toThrow(/Could not mark the player ready/);
    await h.settle();

    const after = entryById(h.state(), entry.id);
    expect(after?.status).not.toBe("ok");
    expect(after?.overridden).toBeUndefined();
    expect(h.actions.some((a) => a.type === "updateEntry")).toBe(false);
    expect(h.errors[0]).toMatch(/owner or an organizer/);
  });

  it("keeps an edit that was queued behind it", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = connectedDesk(seed);

    // The override was queued first, then the payment edit changed the same entry.
    const override = h.adapters.registrations.overrideReady(entry.id, overrideInput(seed));
    const payment = h.adapters.registrations.update(entry.id, { paymentStatus: "recorded_paid" });
    await h.settle();
    expect(h.pending).toHaveLength(1);

    h.pending[0]?.answer();
    await override;
    await h.settle();
    expect(h.pending).toHaveLength(2);
    h.pending[1]?.answer();
    await payment;
    await h.settle();

    const after = entryById(h.state(), entry.id);
    expect(after?.status).toBe("ok");
    expect(after?.paymentStatus).toBe("recorded_paid");
  });

  it("does not erase an edit that came after a refused override", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = connectedDesk(seed);

    const override = h.adapters.registrations.overrideReady(entry.id, overrideInput(seed));
    const payment = h.adapters.registrations.update(entry.id, { paymentStatus: "recorded_paid" });
    await h.settle();

    h.pending[0]?.answer("Only the owner or an organizer can mark a player ready");
    await expect(override).rejects.toThrow(/Could not mark the player ready/);
    await h.settle();
    expect(h.pending).toHaveLength(2);
    h.pending[1]?.answer();
    await payment;
    await h.settle();

    const after = entryById(h.state(), entry.id);
    expect(after?.status).not.toBe("ok");
    expect(after?.paymentStatus).toBe("recorded_paid");
  });

  it("shows a supplied birthdate once its own row is written", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = connectedDesk(seed);

    const write = h.adapters.registrations.overrideReady(entry.id, {
      ...overrideInput(seed),
      birthdate: "1980-05-04",
    });
    await h.settle();
    // The player row goes first; the registration row follows once that one answers.
    expect(h.pending.map((call) => call.target)).toEqual(["players"]);

    h.pending[0]?.answer();
    await h.settle();
    expect(h.state().players.find((player) => player.id === entry.playerId)?.birthdate).toBe(
      "1980-05-04",
    );
    expect(h.pending).toHaveLength(2);
    expect(h.pending[1]?.target).toBe("registrations");

    h.pending[1]?.answer();
    await write;
    await h.settle();
    expect(entryById(h.state(), entry.id)?.status).toBe("ok");
  });

  it("keeps a birthdate that was written even when the registration is refused", async () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = connectedDesk(seed);

    const write = h.adapters.registrations.overrideReady(entry.id, {
      ...overrideInput(seed),
      birthdate: "1980-05-04",
    });
    await h.settle();
    h.pending[0]?.answer();
    await h.settle();
    h.pending[1]?.answer("Only the owner or an organizer can mark a player ready");
    await expect(write).rejects.toThrow(/Could not mark the player ready/);
    await h.settle();

    // The date is on file, so it stays; the entry stays in review.
    expect(h.state().players.find((player) => player.id === entry.playerId)?.birthdate).toBe(
      "1980-05-04",
    );
    expect(entryById(h.state(), entry.id)?.status).not.toBe("ok");
  });
});

describe("the pair's class when one partner's index is edited", () => {
  const pairInput = (partnerEntryId: string) => ({
    index: 2.4,
    effectiveDate: "2026-11-01",
    birthdate: null,
    categoryId: null,
    teeId: null,
    flightId: "d",
    playingHandicap: 3,
    partnerEntryId,
    pairFlightId: "d",
    reason: "Index corrected from the printed card.",
    pending: [],
  });

  it("writes the partner's class in the same queued save and only then shows it", async () => {
    const { state, member, partner } = pairedSeed();
    const h = connectedDesk(state);

    const write = h.adapters.registrations.overrideReady(member.id, pairInput(partner.id));
    await h.settle();
    // The partner's row goes first, then the edited row: one queued write, so the desk never shows
    // half a pair.
    expect(h.pending).toHaveLength(1);
    expect(h.pending[0]?.target).toBe("registrations");
    expect(h.pending[0]?.payload).toEqual({ flight_id: "d" });

    h.pending[0]?.answer();
    await h.settle();
    expect(h.pending).toHaveLength(2);
    expect(entryById(h.state(), partner.id)?.flightId).not.toBe("d");

    h.pending[1]?.answer();
    await write;
    await h.settle();

    expect(entryById(h.state(), member.id)?.flightId).toBe("d");
    expect(entryById(h.state(), partner.id)?.flightId).toBe("d");
    // The partner keeps its own status: it is not an override of its own.
    expect(entryById(h.state(), partner.id)?.overridden).toBeUndefined();
    expect(h.errors).toEqual([]);
  });

  it("shows nothing when the partner's row is refused", async () => {
    const { state, member, partner } = pairedSeed();
    const h = connectedDesk(state);

    const write = h.adapters.registrations.overrideReady(member.id, pairInput(partner.id));
    await h.settle();
    h.pending[0]?.answer("new row violates row-level security policy");
    await expect(write).rejects.toThrow(/pair's class/);
    await h.settle();

    expect(h.actions.some((a) => a.type === "updateEntry")).toBe(false);
    expect(entryById(h.state(), partner.id)?.flightId).not.toBe("d");
    expect(entryById(h.state(), member.id)?.status).not.toBe("ok");
  });

  it("keeps the pair's class in demo mode", () => {
    const { state, member, partner } = pairedSeed();
    const h = demoDesk(state);

    h.adapters.registrations.overrideReady(member.id, pairInput(partner.id));

    expect(entryById(h.state(), member.id)?.flightId).toBe("d");
    expect(entryById(h.state(), partner.id)?.flightId).toBe("d");
    expect(entryById(h.state(), partner.id)?.overridden).toBeUndefined();
  });
});

describe("an event setup save while connected", () => {
  it("shows the saved setup only after the database accepts it", async () => {
    const seed = initialState();
    const tournament = firstTournament(seed);
    const h = connectedDesk(seed);

    const write = h.adapters.setup.save({
      tournament: { ...tournament, name: "Renamed event" },
      tees: seed.tees,
      holes: seed.holes,
    });
    await h.settle();
    expect(h.pending).toHaveLength(1);
    expect(h.actions.some((a) => a.type === "saveSetup")).toBe(false);
    expect(tournamentById(h.state(), tournament.id)?.name).toBe(tournament.name);

    h.pending[0]?.answer();
    await write;
    await h.settle();
    expect(tournamentById(h.state(), tournament.id)?.name).toBe("Renamed event");
    expect(h.errors).toEqual([]);
  });

  it("leaves the last saved setup on screen when the database refuses it", async () => {
    const seed = initialState();
    const tournament = firstTournament(seed);
    const tees = seed.tees.map((tee, i) => (i === 0 ? { ...tee, slope: 140 } : tee));
    const h = connectedDesk(seed);

    const write = h.adapters.setup.save({
      tournament: { ...tournament, name: "Renamed event" },
      tees,
      holes: seed.holes,
    });
    await h.settle();
    h.pending[0]?.answer("The setup changed since this screen loaded.");
    await expect(write).rejects.toThrow(/Could not save the event setup/);
    await h.settle();

    expect(h.actions.some((a) => a.type === "saveSetup")).toBe(false);
    expect(tournamentById(h.state(), tournament.id)?.name).toBe(tournament.name);
    expect(h.state().tees).toEqual(seed.tees);
    expect(h.errors[0]).toMatch(/setup changed since this screen loaded/);
  });

  it("keeps the card's confirmation when the setup write is refused", async () => {
    const seed = initialState();
    const tournament = { ...firstTournament(seed), courseDataConfirmed: true };
    const state: DeskState = {
      ...seed,
      tournaments: seed.tournaments.map((t) => (t.id === tournament.id ? tournament : t)),
    };
    const tees = seed.tees.map((tee, i) => (i === 0 ? { ...tee, slope: 140 } : tee));
    const h = connectedDesk(state);

    const write = h.adapters.setup.save({
      tournament,
      tees,
      holes: seed.holes,
      sections: ["course"],
    });
    await h.settle();
    h.pending[0]?.answer("The setup changed since this screen loaded.");
    await expect(write).rejects.toThrow(/Could not save the event setup/);
    await h.settle();

    const after = tournamentById(h.state(), tournament.id);
    expect(after?.courseDataConfirmed).toBe(true);
    expect(h.state().tees).toEqual(seed.tees);
  });

  it("does not put a refused first save over a later one that landed", async () => {
    const seed = initialState();
    const tournament = firstTournament(seed);
    const h = connectedDesk(seed);

    const first = h.adapters.setup.save({
      tournament: { ...tournament, name: "First name" },
      tees: seed.tees,
      holes: seed.holes,
    });
    const second = h.adapters.setup.save({
      tournament: { ...tournament, name: "Second name" },
      tees: seed.tees,
      holes: seed.holes,
    });
    await h.settle();
    expect(h.pending).toHaveLength(1);

    h.pending[0]?.answer("The setup changed since this screen loaded.");
    await expect(first).rejects.toThrow(/setup changed/);
    await h.settle();
    expect(h.pending).toHaveLength(2);
    h.pending[1]?.answer();
    await second;
    await h.settle();

    expect(tournamentById(h.state(), tournament.id)?.name).toBe("Second name");
    // The refused draft never reached the screen at all.
    const shown = h.actions.flatMap((action) =>
      action.type === "saveSetup" ? [action.tournament.name] : [],
    );
    expect(shown).toEqual(["Second name"]);
  });

  it("shows the numbers that landed even if the confirmation-only write is refused", async () => {
    const seed = initialState();
    const tournament = { ...firstTournament(seed), courseDataConfirmed: true };
    const state: DeskState = {
      ...seed,
      tournaments: seed.tournaments.map((t) => (t.id === tournament.id ? tournament : t)),
    };
    const tees = seed.tees.map((tee, i) => (i === 0 ? { ...tee, slope: 140 } : tee));
    const h = connectedDesk(state);

    const write = h.adapters.setup.save({
      tournament,
      tees,
      holes: seed.holes,
      sections: ["course"],
    });
    await h.settle();
    h.pending[0]?.answer();
    await h.settle();
    // The setup RPC landed, then the confirmation-only update was refused.
    expect(h.pending).toHaveLength(2);
    h.pending[1]?.answer("Could not record the course confirmation");
    await expect(write).rejects.toThrow(/course confirmation/);
    await h.settle();

    // The numbers are saved, so they stay; the database still says confirmed, so the card does too.
    expect(h.state().tees).toEqual(tees);
    expect(tournamentById(h.state(), tournament.id)?.courseDataConfirmed).toBe(true);
    expect(h.errors[0]).toMatch(/course confirmation/);
  });

  it("shows the course confirmation only after its row is written", async () => {
    const seed = initialState();
    const tournament = firstTournament(seed);
    const h = connectedDesk(seed);

    h.adapters.setup.confirmCourse(tournament.id, true);
    await h.settle();
    expect(h.pending).toHaveLength(1);
    expect(tournamentById(h.state(), tournament.id)?.courseDataConfirmed).toBe(
      tournament.courseDataConfirmed,
    );

    h.pending[0]?.answer();
    await h.settle();
    expect(tournamentById(h.state(), tournament.id)?.courseDataConfirmed).toBe(true);
  });

  it("leaves the course confirmation alone when its row is refused", async () => {
    const seed = initialState();
    const tournament = firstTournament(seed);
    const h = connectedDesk(seed);

    h.adapters.setup.confirmCourse(tournament.id, true);
    await h.settle();
    h.pending[0]?.answer("Could not record the course confirmation");
    await h.settle();

    expect(tournamentById(h.state(), tournament.id)?.courseDataConfirmed).toBe(
      tournament.courseDataConfirmed,
    );
    expect(h.errors[0]).toMatch(/course confirmation/);
  });
});

describe("demo mode keeps its instant changes", () => {
  it("applies a registration edit at once, with nothing to wait for", () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = demoDesk(seed);

    h.adapters.registrations.update(entry.id, { paymentStatus: "waived" });
    expect(entryById(h.state(), entry.id)?.paymentStatus).toBe("waived");
  });

  it("marks a player ready at once", () => {
    const seed = initialState();
    const entry = firstEntry(seed);
    const h = demoDesk(seed);

    h.adapters.registrations.overrideReady(entry.id, overrideInput(seed));
    expect(entryById(h.state(), entry.id)?.status).toBe("ok");
    expect(entryById(h.state(), entry.id)?.overridden).toBe(true);
  });

  it("saves the event setup at once", () => {
    const seed = initialState();
    const tournament = firstTournament(seed);
    const h = demoDesk(seed);

    h.adapters.setup.save({
      tournament: { ...tournament, name: "Demo rename" },
      tees: seed.tees,
      holes: seed.holes,
    });
    expect(tournamentById(h.state(), tournament.id)?.name).toBe("Demo rename");
  });

  it("records the course confirmation at once", () => {
    const seed = initialState();
    const tournament = firstTournament(seed);
    const h = demoDesk(seed);

    h.adapters.setup.confirmCourse(tournament.id, true);
    expect(tournamentById(h.state(), tournament.id)?.courseDataConfirmed).toBe(true);
  });
});
