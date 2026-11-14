import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { OverrideReadyInput } from "@/lib/data/adapters";
import { type Action, type DeskState, initialState } from "@/lib/store/state";
import type { Database } from "@/lib/supabase/types";
import { createSupabaseAdapters } from "./adapters";

/**
 * An index saved on a registration is carried into every round the player already has a card in,
 * and a published round is published again. A round that refuses is named in the failure, and the
 * registration that was already written is not rolled back.
 */

type Row = Record<string, unknown>;

interface Script {
  rounds?: Row[];
  roundEntries?: Row[];
  publications?: Row[];
  /** Round entry id to the refusal message the database answers with. */
  refuseCorrection?: Record<string, string>;
  /** Round id to the refusal message the database answers with. */
  refusePublish?: Record<string, string>;
}

interface Chain {
  select: () => Chain;
  update: (value: Row) => Chain;
  eq: () => Chain;
  in: () => Chain;
  order: () => Chain;
  limit: () => Chain;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (
    resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

/** A small stand-in for the database: scripted reads, recorded writes and function calls. */
function fakeClient(script: Script) {
  const writes: Array<{ table: string; patch: Row }> = [];
  const calls: Array<{ name: string; args: Row }> = [];

  function rowsFor(table: string): Row[] {
    if (table === "competition_rounds") return script.rounds ?? [];
    if (table === "round_entries") return script.roundEntries ?? [];
    if (table === "round_publications") return script.publications ?? [];
    return [];
  }

  function from(table: string): Chain {
    let patch: Row | null = null;
    const chain: Chain = {
      select: () => chain,
      update: (value) => {
        patch = value;
        return chain;
      },
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve, reject) => {
        if (patch) {
          writes.push({ table, patch });
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: rowsFor(table), error: null }).then(resolve, reject);
      },
    };
    return chain;
  }

  async function rpc(name: string, args: Row) {
    calls.push({ name, args });
    if (name === "correct_handicap_snapshot") {
      const refusal = script.refuseCorrection?.[String(args.p_round_entry)];
      return refusal
        ? { data: null, error: { message: refusal } }
        : { data: { ok: true }, error: null };
    }
    if (name === "publish_round") {
      const refusal = script.refusePublish?.[String(args.p_round)];
      return refusal ? { data: null, error: { message: refusal } } : { data: 2, error: null };
    }
    return { data: null, error: null };
  }

  const client = {
    from,
    rpc,
    auth: { getSession: async () => ({ data: { session: null } }) },
  } as unknown as SupabaseClient<Database>;

  return { client, writes, calls };
}

function harness(
  scriptFor: (registrationId: string) => Script,
  input: Partial<OverrideReadyInput> = {},
) {
  const state: DeskState = initialState();
  const tournament = state.tournaments[0];
  const entry = state.entries.find((candidate) => candidate.tournamentId === tournament?.id);
  const tee = state.tees[0];
  if (!tournament || !entry || !tee)
    throw new Error("the demo has an event, a registration and a tee");

  const actions: Action[] = [];
  const errors: string[] = [];
  const fake = fakeClient(scriptFor(entry.id));
  const adapters = createSupabaseAdapters(state, (action) => actions.push(action), {
    client: fake.client,
    clubId: state.clubId,
    revisions: { get: () => null, set: () => {} },
    canWrite: () => true,
    onError: (message) => errors.push(message),
    onSaved: () => {},
    onBusy: () => {},
  });

  const save = (over: Partial<OverrideReadyInput> = {}) =>
    adapters.registrations.overrideReady(entry.id, {
      index: 12.3,
      effectiveDate: "2026-11-14",
      birthdate: null,
      categoryId: entry.categoryId ?? null,
      teeId: tee.id,
      flightId: entry.flightId ?? null,
      playingHandicap: 12,
      reason: "Index corrected from the paper card.",
      pending: [],
      ...input,
      ...over,
    }) as Promise<void>;

  return { entry, tee, actions, errors, writes: fake.writes, calls: fake.calls, save };
}

const schedule = (registrationId: string) => ({
  rounds: [
    { id: "round-1", day_number: 1, status: "provisional" },
    { id: "round-2", day_number: 2, status: "scoring" },
    { id: "round-3", day_number: 3, status: "final" },
    { id: "round-4", day_number: 4, status: "open" },
  ],
  roundEntries: [
    { id: "re-1", round_id: "round-1", registration_id: registrationId },
    { id: "re-2", round_id: "round-2", registration_id: registrationId },
    { id: "re-3", round_id: "round-3", registration_id: registrationId },
    { id: "re-4", round_id: "round-4", registration_id: registrationId },
  ],
  publications: [{ round_id: "round-1" }, { round_id: "round-1" }, { round_id: "round-2" }],
});

describe("registrations.overrideReady correcting the played rounds", () => {
  it("corrects and republishes each scored round in day order", async () => {
    const h = harness(schedule);
    await h.save();

    expect(
      h.calls.map((call) => [call.name, call.args.p_round ?? call.args.p_round_entry]),
    ).toEqual([
      ["correct_handicap_snapshot", "re-1"],
      ["publish_round", "round-1"],
      ["correct_handicap_snapshot", "re-2"],
      ["publish_round", "round-2"],
    ]);
    const publish = h.calls.find((call) => call.name === "publish_round");
    expect(publish?.args.p_note).toContain("index corrected to 12.3");
    expect(publish?.args.p_note).toContain(`from the ${h.tee.name} tee`);
  });

  it("sends the registration's own tee, and corrects the snapshot from the dialog's index and date", async () => {
    const h = harness(schedule);
    await h.save();

    const registration = h.writes.find((write) => write.table === "registrations");
    expect(registration?.patch.tee_id).toBe(h.tee.id);
    const correction = h.calls.find((call) => call.name === "correct_handicap_snapshot");
    expect(correction?.args).toMatchObject({
      p_index: 12.3,
      p_effective: "2026-11-14",
      p_reason: "Index corrected from the paper card.",
    });
  });

  it("corrects a round that was never published without publishing it", async () => {
    const h = harness((registrationId) => ({ ...schedule(registrationId), publications: [] }));
    await h.save();

    expect(h.calls.map((call) => call.name)).toEqual([
      "correct_handicap_snapshot",
      "correct_handicap_snapshot",
    ]);
  });

  it("leaves a final, open or draft round alone", async () => {
    const h = harness(schedule);
    await h.save();

    const corrected = h.calls
      .filter((call) => call.name === "correct_handicap_snapshot")
      .map((call) => call.args.p_round_entry);
    expect(corrected).toEqual(["re-1", "re-2"]);
  });

  it("names the round that failed and keeps the registration that was written", async () => {
    const h = harness((registrationId) => ({
      ...schedule(registrationId),
      refuseCorrection: { "re-1": "A handicap snapshot is frozen" },
    }));

    await expect(h.save()).rejects.toThrow(/Day 1: A handicap snapshot is frozen/);
    // The registration is on file: the refusal is about the round, not the index.
    expect(h.writes.some((write) => write.table === "registrations")).toBe(true);
    expect(h.actions.some((action) => action.type === "updateEntry")).toBe(true);
    // The desk is told, so nothing fails silently.
    expect(h.errors.join(" ")).toContain("Day 1: A handicap snapshot is frozen");
    // The other day still went through.
    expect(h.calls.map((call) => call.name)).toContain("correct_handicap_snapshot");
  });

  it("says plainly when the correction is not published either", async () => {
    const h = harness((registrationId) => ({
      ...schedule(registrationId),
      refusePublish: { "round-1": "Provisional publication is off" },
    }));

    await expect(h.save()).rejects.toThrow(
      /Day 1: the handicap was corrected, but the round could not be published: Provisional publication is off/,
    );
  });

  it("touches no round when the index is cleared", async () => {
    const h = harness(schedule);
    await h.save({ index: null });

    expect(h.calls).toEqual([]);
    expect(h.writes.some((write) => write.table === "registrations")).toBe(true);
  });
});
