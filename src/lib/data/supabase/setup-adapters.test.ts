import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { type Action, type DeskState, emptyState, initialState } from "@/lib/store/state";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseAdapters } from "./adapters";

interface Call {
  kind: "insert" | "upsert" | "update" | "rpc";
  target: string;
  payload: unknown;
}

/** Records every write the adapter makes, in order, and can be told to fail one. */
function harness(state: DeskState, fail: { rpc?: string; update?: string } = {}) {
  const calls: Call[] = [];
  const actions: Action[] = [];
  const errors: string[] = [];
  const created: string[] = [];
  const revisions: Record<string, number> = {};
  let busy = false;

  const client = {
    from: (table: string) => ({
      insert: async (payload: unknown) => {
        calls.push({ kind: "insert", target: table, payload });
        return { error: null };
      },
      upsert: async (payload: unknown) => {
        calls.push({ kind: "upsert", target: table, payload });
        return { error: null };
      },
      update: (payload: unknown) => ({
        eq: () => ({
          eq: async () => {
            calls.push({ kind: "update", target: table, payload });
            return { error: fail.update ? { message: fail.update } : null };
          },
        }),
      }),
    }),
    rpc: async (fn: string, payload: unknown) => {
      calls.push({ kind: "rpc", target: fn, payload });
      return fail.rpc
        ? { data: null, error: { message: fail.rpc } }
        : { data: { ok: true, revision: 7 }, error: null };
    },
  } as unknown as SupabaseClient<Database>;

  const adapters = createSupabaseAdapters(state, (a) => actions.push(a), {
    client,
    clubId: state.clubId || "club-1",
    onError: (m) => errors.push(m),
    onSaved: () => {},
    onBusy: (b) => {
      busy = b;
    },
    onEventCreated: (id) => created.push(id),
    revisions: {
      get: (id) => revisions[id],
      set: (id, n) => {
        revisions[id] = n;
      },
    },
  });

  // The adapter queues its writes; wait until the queue has drained.
  const settled = async () => {
    for (let i = 0; i < 200 && (busy || i < 3); i++) await new Promise((r) => setTimeout(r, 0));
  };
  return { adapters, calls, actions, errors, created, revisions, settled };
}

const completeCard = (state: DeskState) =>
  state.holes.map((h) => ({ ...h, par: 4, strokeIndex: h.number }));

const firstTournament = (state: DeskState) => {
  const t = state.tournaments[0];
  if (!t) throw new Error("the demo has a tournament");
  return t;
};

describe("setup.save on the club database", () => {
  it("saves the setup first and then the event row, which the setup function does not write", async () => {
    const state = initialState();
    const t = firstTournament(state);
    const h = harness(state);
    h.adapters.setup.save({
      tournament: { ...t, name: "Renamed event" },
      tees: state.tees,
      holes: state.holes,
    });
    await h.settled();

    expect(h.calls.map((c) => `${c.kind}:${c.target}`)).toEqual([
      "rpc:save_event_setup",
      "upsert:tournaments",
    ]);
    expect((h.calls[1]?.payload as { name: string }).name).toBe("Renamed event");
    expect(h.actions[0]?.type).toBe("saveSetup");
  });

  it("sends the last revision it knows and remembers the one it gets back", async () => {
    const state = initialState();
    const t = firstTournament(state);
    const h = harness(state);
    h.revisions[t.id] = 4;
    h.adapters.setup.save({ tournament: t, tees: state.tees, holes: state.holes });
    await h.settled();
    expect((h.calls[0]?.payload as { p_expected_revision: number }).p_expected_revision).toBe(4);
    // The database answered 7, and the draw writes read the same counter.
    expect(h.revisions[t.id]).toBe(7);

    h.adapters.setup.save({ tournament: t, tees: state.tees, holes: state.holes });
    await h.settled();
    const second = h.calls.filter((c) => c.kind === "rpc")[1];
    expect((second?.payload as { p_expected_revision: number }).p_expected_revision).toBe(7);
  });

  it("keeps the old revision when the setup is refused", async () => {
    const state = initialState();
    const t = firstTournament(state);
    const h = harness(state, { rpc: "The setup changed since this screen loaded." });
    h.revisions[t.id] = 4;
    h.adapters.setup.save({ tournament: t, tees: state.tees, holes: state.holes });
    await h.settled();
    expect(h.revisions[t.id]).toBe(4);
  });

  it("does not write the event row when the revision guard refuses the setup", async () => {
    const state = initialState();
    const h = harness(state, { rpc: "The setup changed since this screen loaded." });
    h.adapters.setup.save({
      tournament: firstTournament(state),
      tees: state.tees,
      holes: state.holes,
    });
    await h.settled();

    expect(h.calls.map((c) => c.kind)).toEqual(["rpc"]);
    expect(h.errors[0]).toMatch(/setup changed since this screen loaded/);
  });

  it("never invents a par or stroke index: a blank card is not sent", async () => {
    const state = initialState();
    const t = firstTournament(state);
    const blank = harness(state);
    blank.adapters.setup.save({ tournament: t, tees: state.tees, holes: state.holes });
    await blank.settled();
    expect((blank.calls[0]?.payload as { p_holes: unknown }).p_holes).toBeNull();

    const full = harness(state);
    full.adapters.setup.save({ tournament: t, tees: state.tees, holes: completeCard(state) });
    await full.settled();
    const sent = (full.calls[0]?.payload as { p_holes: { par: number }[] }).p_holes;
    expect(sent).toHaveLength(18);
    expect(sent.every((x) => x.par === 4)).toBe(true);
  });

  it("does not send a card with a repeated stroke index", async () => {
    const state = initialState();
    const card = completeCard(state).map((x) => (x.number === 6 ? { ...x, strokeIndex: 1 } : x));
    const h = harness(state);
    h.adapters.setup.save({ tournament: firstTournament(state), tees: state.tees, holes: card });
    await h.settled();
    expect((h.calls[0]?.payload as { p_holes: unknown }).p_holes).toBeNull();
  });

  it("withdraws the scorecard confirmation when a number it vouched for changes", async () => {
    const state = initialState();
    const t = firstTournament(state);
    const tees = state.tees.map((x, i) => (i === 0 ? { ...x, slope: 140 } : x));
    const h = harness(state);
    h.adapters.setup.save({
      tournament: { ...t, courseDataConfirmed: true },
      tees,
      holes: state.holes,
    });
    await h.settled();

    const saved = h.actions[0];
    expect(saved?.type === "saveSetup" && saved.tournament.courseDataConfirmed).toBe(false);
    expect(h.calls.at(-1)).toMatchObject({
      kind: "update",
      target: "tournaments",
      payload: { course_data_confirmed: false },
    });
  });

  it("keeps the confirmation when only the event's own settings change", async () => {
    const state = initialState();
    const t = firstTournament(state);
    const h = harness(state);
    h.adapters.setup.save({
      tournament: { ...t, courseDataConfirmed: true, name: "Same card, new name" },
      tees: state.tees,
      holes: state.holes,
    });
    await h.settled();
    const saved = h.actions[0];
    expect(saved?.type === "saveSetup" && saved.tournament.courseDataConfirmed).toBe(true);
    expect(h.calls.some((c) => c.kind === "update")).toBe(false);
  });
});

describe("confirmCourse", () => {
  it("records the confirmation on the event", async () => {
    const state = initialState();
    const h = harness(state);
    h.adapters.setup.confirmCourse(firstTournament(state).id, true);
    await h.settled();
    expect(h.calls[0]).toMatchObject({ kind: "update", payload: { course_data_confirmed: true } });
    expect(h.errors).toEqual([]);
  });

  it("says plainly when the database has not had the migration yet", async () => {
    const state = initialState();
    const h = harness(state, {
      update: "Could not find the 'course_data_confirmed' column of 'tournaments'",
    });
    h.adapters.setup.confirmCourse(firstTournament(state).id, true);
    await h.settled();
    expect(h.errors[0]).toMatch(/20261027000000/);
  });
});

describe("creating an event", () => {
  it("sets up the course, the event and its setup for a club that has none, then reloads", async () => {
    const state: DeskState = {
      ...emptyState(),
      clubId: "club-1",
      club: { id: "club-1", name: "Iloilo Golf & Country Club", shortName: "", location: "" },
    };
    const h = harness(state);
    const created = h.adapters.tournaments.createFromTemplate("November Open", "2026-11-12");
    await h.settled();

    expect(h.calls.map((c) => `${c.kind}:${c.target}`)).toEqual([
      "insert:courses",
      "upsert:tournaments",
      "rpc:save_event_setup",
    ]);
    const course = h.calls[0]?.payload as { id: string };
    const row = h.calls[1]?.payload as { id: string; course_id: string };
    expect(row.course_id).toBe(course.id);
    expect(row.id).toBe(created.id);

    // The starter categories and tees go in; their demo ids do not, so the database issues its own.
    const rpc = h.calls[2]?.payload as {
      p_tees: { name: string }[];
      p_categories: { id: string; teeName: string }[];
      p_flights: { id: string; categoryName: string }[];
      p_holes: unknown;
    };
    expect(rpc.p_tees.map((x) => x.name)).toContain("White");
    expect(rpc.p_categories.every((c) => c.id === "" && c.teeName !== "")).toBe(true);
    expect(rpc.p_flights.every((f) => f.id === "" && f.categoryName !== "")).toBe(true);
    expect(rpc.p_holes).toBeNull();

    // A new event is never born confirmed: its tee numbers are the starter samples.
    expect(created.courseDataConfirmed).toBe(false);
    expect(h.created).toEqual([created.id]);
    expect(h.actions.map((a) => a.type)).toEqual(["saveSetup", "selectTournament"]);
  });

  it("reuses the club's course and tees for a later event, without inserting a course", async () => {
    const state = initialState();
    const h = harness(state);
    const created = h.adapters.tournaments.createFromTemplate("Monthly Medal", "2026-12-05");
    await h.settled();

    expect(h.calls.map((c) => `${c.kind}:${c.target}`)).toEqual([
      "upsert:tournaments",
      "rpc:save_event_setup",
    ]);
    const rpc = h.calls[1]?.payload as { p_tees: unknown[] };
    expect(rpc.p_tees).toHaveLength(state.tees.length);
    expect(created.categories).toHaveLength(firstTournament(state).categories.length);
    expect(h.created).toEqual([created.id]);
  });

  it("does not announce an event that failed to save", async () => {
    const state = initialState();
    const h = harness(state, { rpc: "Only the owner or an organizer can change the event setup" });
    h.adapters.tournaments.createFromTemplate("Monthly Medal", "2026-12-05");
    await h.settled();
    expect(h.created).toEqual([]);
    expect(h.errors[0]).toMatch(/owner or an organizer/);
  });
});
