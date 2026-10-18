/**
 * Supabase-backed adapters.
 *
 * The `Adapters` interface is synchronous because every screen already calls it that way. So the
 * shape here is: reads come from the hydrated desk state (one read on load), and writes update that
 * state first and are then queued to Supabase. A failed write is reported through `onError` so the
 * provider can show it, rather than pretending the save happened.
 *
 * Nothing here is used in demo mode; `desk-store.tsx` picks the mock adapters when no
 * `NEXT_PUBLIC_SUPABASE_URL` is set.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch } from "react";
import {
  type Adapters,
  createMockAdapters,
  type NewEntryInput,
  type NewPlayerInput,
} from "@/lib/data/adapters";
import { freezeIndex, selectIndexForCutOff } from "@/lib/data/frozen";
import { setupPayload } from "@/lib/data/setup-payload";
import type { HandicapRecord, PlayerRecord, RegistrationEntry, Tournament } from "@/lib/data/types";
import type { Action, DeskState } from "@/lib/store/state";
import type { Database, Json } from "@/lib/supabase/types";
import {
  toDeferredMatchInsert,
  toImportBatchInsert,
  toPlayerInsert,
  toRegistrationAnswers,
  toRegistrationInsert,
} from "./domain";

export interface SupabaseAdapterOptions {
  client: SupabaseClient<Database>;
  /** Called with a human message when a write fails; the state is not rolled back here. */
  onError: (message: string) => void;
  /** Called after a successful write, for a "saved at" label. */
  onSaved: () => void;
  /** Called when the queue starts and when it drains. */
  onBusy: (busy: boolean) => void;
  clubId: string;
}

const uuid = () => crypto.randomUUID();

/** Serialises writes so two edits to the same row cannot race. */
export function createQueue(
  options: Pick<SupabaseAdapterOptions, "onError" | "onSaved" | "onBusy">,
) {
  let pending: Promise<unknown> = Promise.resolve();
  let depth = 0;
  return (work: () => Promise<unknown>) => {
    depth += 1;
    options.onBusy(true);
    pending = pending
      .then(work)
      .then(() => {
        options.onSaved();
      })
      .catch((error: unknown) => {
        options.onError(error instanceof Error ? error.message : "Could not save the change.");
      })
      .finally(() => {
        depth -= 1;
        if (depth === 0) options.onBusy(false);
      });
  };
}

function fail(context: string, error: { message: string } | null): never | void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export function createSupabaseAdapters(
  state: DeskState,
  dispatch: Dispatch<Action>,
  options: SupabaseAdapterOptions,
): Adapters {
  const { client, clubId } = options;
  const enqueue = createQueue(options);
  // The pure parts (CSV parsing, the merge queue, the routing explanation) read the same hydrated
  // state, so they reuse the mock implementation rather than duplicating it.
  const mock = createMockAdapters(state, dispatch);

  /**

   * Players ------------------------------------------------------------------------------------ */

  const players: Adapters["players"] = {
    list: () => state.players,
    search: (query) => {
      const q = query.trim().toLowerCase();
      if (!q) return state.players;
      return state.players.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.ngapId ?? "").toLowerCase().includes(q) ||
          (p.homeCourse ?? "").toLowerCase().includes(q) ||
          (p.nickname ?? "").toLowerCase().includes(q),
      );
    },
    get: (id) => state.players.find((p) => p.id === id) ?? null,
    recordsFor: (playerId) => state.records.filter((r) => r.playerId === playerId),
    latestRecord: (playerId) => {
      const list = state.records
        .filter((r) => r.playerId === playerId)
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
      return list[0] ?? null;
    },
    add: (input: NewPlayerInput) => {
      const first = input.firstName.trim();
      const last = input.lastName.trim();
      const player: PlayerRecord = {
        id: uuid(),
        clubId,
        firstName: first,
        lastName: last,
        nickname: input.nickname?.trim() || null,
        name: `${first} ${last}`.trim() || "Unnamed player",
        birthdate: input.birthdate ?? null,
        gender: input.gender ?? null,
        homeCourse: input.homeCourse?.trim() || null,
        contactNumber: input.contactNumber?.trim() || null,
        email: input.email?.trim() || null,
        ngapId: input.ngapId?.trim() || null,
        photo: input.photo,
        photoConsent: input.photo ? (input.photoConsent ?? false) : undefined,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "addPlayer", player });
      enqueue(async () => {
        const { error } = await client.from("players").insert(toPlayerInsert(player));
        fail("Could not add the player", error);
      });
      return player;
    },
    update: (id, patch) => {
      dispatch({ type: "updatePlayer", id, patch });
      const next = { ...(state.players.find((p) => p.id === id) as PlayerRecord), ...patch, id };
      enqueue(async () => {
        const { error } = await client
          .from("players")
          .update({
            full_name: next.name,
            birthdate: next.birthdate ?? "",
            gender: next.gender ?? "M",
            ngap_id: next.ngapId,
            phone: next.contactNumber,
            first_name: next.firstName,
            last_name: next.lastName,
            nickname: next.nickname,
            home_course: next.homeCourse,
            email: next.email,
          })
          .eq("club_id", clubId)
          .eq("id", id);
        fail("Could not save the player", error);
      });
    },
    remove: (id) => {
      dispatch({ type: "removePlayer", id });
      enqueue(async () => {
        const { error } = await client.from("players").delete().eq("club_id", clubId).eq("id", id);
        fail("Could not remove the player", error);
      });
    },
  };

  /**

   * Tournaments -------------------------------------------------------------------------------- */

  const saveTournamentRow = (tournament: Tournament) => {
    enqueue(async () => {
      const { error } = await client.from("tournaments").upsert(
        {
          id: tournament.id,
          club_id: clubId,
          course_id: tournament.courseId,
          name: tournament.name,
          play_date: tournament.config.date,
          cutoff_date: tournament.cutOffDate,
          start_format: tournament.config.startFormat,
          first_tee_time: tournament.config.firstTeeTime,
          interval_minutes: tournament.config.intervalMinutes,
          wave_gap_minutes: tournament.config.waveGapMinutes,
          group_size: tournament.config.groupSize,
          min_group_size: tournament.config.minGroupSize,
          max_index: tournament.config.maxIndex,
          allowance: tournament.config.allowance,
          flight_basis:
            tournament.config.flightBasis === "courseHandicap" ? "course_handicap" : "index",
          dates: tournament.dates,
          state: tournament.state,
          name_needs_confirmation: tournament.nameNeedsConfirmation,
          schedule_needs_confirmation: tournament.scheduleNeedsConfirmation,
          stale_index_days: tournament.staleIndexDays,
          registration: JSON.parse(JSON.stringify(tournament.registration)) as Json,
        },
        { onConflict: "id" },
      );
      fail("Could not save the event", error);
    });
  };

  const tournaments: Adapters["tournaments"] = {
    list: () => state.tournaments,
    get: (id) => state.tournaments.find((t) => t.id === id) ?? null,
    active: () =>
      state.tournaments.find((t) => t.id === state.activeTournamentId) ??
      state.tournaments[0] ??
      null,
    select: (id) => dispatch({ type: "selectTournament", id }),
    save: (tournament) => {
      dispatch({ type: "saveTournament", tournament });
      saveTournamentRow(tournament);
    },
    createFromTemplate: (name, date) => {
      // The template itself is built by the store's reducer path; mirror it here with a real id.
      const created: Tournament = {
        ...(state.tournaments[0] as Tournament),
        id: uuid(),
        name,
        nameNeedsConfirmation: true,
        dates: [date],
        createdAt: new Date().toISOString(),
      };
      created.config = { ...created.config, date };
      dispatch({ type: "saveTournament", tournament: created });
      dispatch({ type: "selectTournament", id: created.id });
      saveTournamentRow(created);
      return created;
    },
  };

  /**

   * Registrations ------------------------------------------------------------------------------ */

  const entryRow = (entry: RegistrationEntry, tournamentId: string) =>
    toRegistrationInsert(entry, tournamentId);

  const registrations: Adapters["registrations"] = {
    list: (tournamentId) => state.entries.filter((e) => e.tournamentId === tournamentId),
    add: (tournamentId, input: NewEntryInput) => {
      const records = players.recordsFor(input.playerId);
      const tournament = tournaments.get(tournamentId);
      const selection = selectIndexForCutOff(records, tournament?.cutOffDate ?? "9999-12-31");
      const entry: RegistrationEntry = {
        id: uuid(),
        clubId,
        tournamentId,
        playerId: input.playerId,
        role: input.role,
        sponsor: input.sponsor,
        shirt: input.shirt,
        teePreferences: input.teePreferences,
        declaredWshId: input.declaredWshId,
        declaredWshHandicap: input.declaredWshHandicap,
        extra: input.extra,
        paymentStatus: input.paymentStatus,
        frozen: freezeIndex(selection, new Date().toISOString()),
        createdAt: new Date().toISOString(),
        source: "desk",
      };
      dispatch({ type: "addEntry", entry });
      enqueue(async () => {
        const { error } = await client.from("registrations").insert(entryRow(entry, tournamentId));
        fail("Could not register the player", error);
      });
      return entry;
    },
    update: (id, patch) => {
      dispatch({ type: "updateEntry", id, patch });
      const next = { ...(state.entries.find((e) => e.id === id) as RegistrationEntry), ...patch };
      enqueue(async () => {
        const { error } = await client
          .from("registrations")
          .update({
            payment_status:
              next.paymentStatus === "recorded_paid"
                ? "paid"
                : next.paymentStatus === "waived"
                  ? "waived"
                  : "unpaid",
            answers: toRegistrationAnswers(next) as Json,
          })
          .eq("club_id", clubId)
          .eq("id", id);
        fail("Could not save the registration", error);
      });
    },
    remove: (id) => {
      dispatch({ type: "removeEntry", id });
      enqueue(async () => {
        const { error } = await client
          .from("registrations")
          .delete()
          .eq("club_id", clubId)
          .eq("id", id);
        fail("Could not remove the registration", error);
      });
    },
    refreeze: (tournamentId, entryIds) => {
      dispatch({ type: "refreeze", tournamentId, entryIds });
      const tournament = tournaments.get(tournamentId);
      const targets = state.entries.filter(
        (e) => e.tournamentId === tournamentId && (!entryIds || entryIds.includes(e.id)),
      );
      enqueue(async () => {
        for (const entry of targets) {
          const selection = selectIndexForCutOff(
            players.recordsFor(entry.playerId),
            tournament?.cutOffDate ?? "9999-12-31",
          );
          const frozen = freezeIndex(selection, new Date().toISOString());
          const { error } = await client
            .from("registrations")
            .update({
              frozen_index: frozen.index,
              frozen_record_id: frozen.recordId,
              frozen_effective_date: frozen.effectiveDate,
              frozen_at: frozen.frozenAt,
            })
            .eq("club_id", clubId)
            .eq("id", entry.id);
          fail("Could not re-freeze the index", error);
        }
      });
    },
  };

  /**

   * Imports ------------------------------------------------------------------------------------ */

  const imports: Adapters["imports"] = {
    sampleFileName: "sample-ngap.csv",
    // Parsing and review are pure and stay in the mock; only the write path touches Supabase.
    sample: mock.imports.sample,
    parse: mock.imports.parse,
    guessMapping: mock.imports.guessMapping,
    review: mock.imports.review,
    apply: (payload) => {
      dispatch({ type: "applyImport", payload });
      const batch = {
        id: uuid(),
        clubId,
        fileName: payload.fileName,
        importedAt: new Date().toISOString(),
        rowCount: payload.rowCount,
        appliedCount: payload.rows.length,
        skippedCount: payload.skippedCount,
        note: payload.note,
      };
      enqueue(async () => {
        const records = payload.rows.flatMap((row) =>
          row.playerId && row.index !== undefined
            ? [
                {
                  club_id: clubId,
                  player_id: row.playerId,
                  handicap_index: row.index,
                  effective_date: row.effectiveDate,
                  source: "ngap_import" as const,
                },
              ]
            : [],
        );
        if (records.length) {
          const { error } = await client
            .from("handicap_records")
            .upsert(records, { onConflict: "player_id,effective_date" });
          fail("Could not save the imported handicaps", error);
        }
        const { error: batchError } = await client
          .from("handicap_import_batches")
          .insert(toImportBatchInsert(batch));
        fail("Could not record the import", batchError);
        if (payload.deferred.length) {
          const { error: deferredError } = await client.from("deferred_matches").insert(
            payload.deferred.map((row) =>
              toDeferredMatchInsert({
                id: uuid(),
                clubId,
                name: row.name,
                ngapId: row.ngapId,
                index: row.index,
                effectiveDate: row.effectiveDate,
                reason: row.conflicts.concat(row.warnings).join(" ") || "Needs a decision",
                candidatePlayerIds: row.candidates.map((c) => c.playerId),
                fileName: payload.fileName,
                at: new Date().toISOString(),
              }),
            ),
          );
          fail("Could not save the deferred rows", deferredError);
        }
      });
    },
  };

  /**

   * Router ------------------------------------------------------------------------------------- */

  const router: Adapters["router"] = {
    propose: (preserveLocks) => dispatch({ type: "generate", preserveLocks }),
    explain: (playerId) => mock.router.explain(playerId),
  };

  /**

   * Event setup -------------------------------------------------------------------------------- */

  // The revision this browser last saw. The guard only bites from the second save onward, because
  // the desk state does not carry the revision yet; a save without one is unguarded but still atomic.
  let setupRevision: number | null = null;

  const setup: Adapters["setup"] = {
    save: ({ tournament, tees, holes, sections = "all" }) => {
      // The draft lands in the session state either way, so a failed write still leaves the edit on
      // screen; the session bar is what says whether it reached the database.
      dispatch({ type: "saveTournament", tournament });
      const payload = setupPayload(tournament, tees, holes, sections);
      enqueue(async () => {
        const { data, error } = await client.rpc("save_event_setup", {
          p_tournament: tournament.id,
          p_expected_revision: setupRevision,
          ...payload,
          // The registration document is JSON in the database; the domain type has the same shape.
          p_registration: payload.p_registration as Json | null,
        });
        if (error) throw new Error(`Could not save the event setup: ${error.message}`);
        const result = data as unknown as { revision?: number } | null;
        setupRevision = typeof result?.revision === "number" ? result.revision : setupRevision;
      });
    },
    revision: () => setupRevision,
  };

  return { players, tournaments, registrations, imports, router, setup };
}
