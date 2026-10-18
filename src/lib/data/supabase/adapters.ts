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
import { courseNumbersChanged, holesComplete, strokeIndexProblem } from "@/lib/data/course-data";
import { freezeIndex, selectIndexForCutOff } from "@/lib/data/frozen";
import { starterSetup } from "@/lib/data/starter";
import type {
  HandicapRecord,
  Hole,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "@/lib/data/types";
import type { Tee } from "@/lib/routing";
import {
  type Action,
  activeTournament,
  type DeskState,
  tournamentTemplate,
} from "@/lib/store/state";
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
  /**
   * Called once a new event is fully written (course, event row and setup), so the desk can reload
   * and pick up the database's own ids for its categories and flights.
   */
  onEventCreated?: (tournamentId: string) => void;
  /**
   * Each event's draw revision as the database last confirmed it, shared with the draw writes.
   * The setup function checks and bumps the same counter, so both must read and write one copy;
   * a copy held inside this object would be lost every time the desk state changes and the
   * adapters are rebuilt, and the guard would then never refuse anything.
   */
  revisions?: {
    get: (tournamentId: string) => number | undefined;
    set: (tournamentId: string, revision: number) => void;
  };
}

const uuid = () => crypto.randomUUID();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const writeTournament = async (tournament: Tournament) => {
    {
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
    }
  };
  const saveTournamentRow = (tournament: Tournament) => enqueue(() => writeTournament(tournament));

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
      // A club with no event yet has no tees or categories to copy, so it starts from the starter
      // setup. Either way the new event gets its own categories and flights (they belong to one
      // event), so ids are left off and the database assigns them; the desk reloads to read them.
      const base = activeTournament(state) ?? state.tournaments[0] ?? null;
      const useStarter = !base || state.tees.length === 0;
      const starter = starterSetup();
      const tees = useStarter ? starter.tees : state.tees;
      const courseId = base?.courseId ?? uuid();
      const created: Tournament = {
        ...tournamentTemplate(state, name, date),
        id: uuid(),
        courseId,
        categories: useStarter ? starter.categories : (base?.categories ?? []),
        flights: useStarter ? starter.flights : (base?.flights ?? []),
      };
      dispatch({ type: "saveSetup", tournament: created, tees, holes: state.holes });
      dispatch({ type: "selectTournament", id: created.id });
      enqueue(async () => {
        if (!base) {
          const { error } = await client.from("courses").insert({
            id: courseId,
            club_id: clubId,
            name: `${state.club.name || "Club"} course`,
            holes: 18,
          });
          fail("Could not set up the course", error);
        }
        await writeTournament(created);
        await saveSetupRows({ tournament: created, tees, holes: null, expectedRevision: null });
        options.onEventCreated?.(created.id);
      });
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

  /** One save_event_setup call. Holes go only as a whole, valid card: the table cannot hold a blank par. */
  const saveSetupRows = async (input: {
    tournament: Tournament;
    tees: Tee[];
    holes: Hole[] | null;
    expectedRevision: number | null;
  }) => {
    const { tournament, tees, holes } = input;
    const teeNameById = new Map(tees.map((tee) => [tee.id, tee.name]));
    const categoryNameById = new Map(
      tournament.categories.map((category) => [category.id, category.name]),
    );
    // Ids the database did not issue (starter and copied rows) are left off so it inserts them.
    const dbId = (id: string) => (UUID.test(id) ? id : "");
    const { data, error } = await client.rpc("save_event_setup", {
      p_tournament: tournament.id,
      p_expected_revision: input.expectedRevision,
      p_course: { holes: tournament.config.holes },
      p_holes: holes
        ? holes.map((hole) => ({
            number: hole.number,
            par: hole.par,
            strokeIndex: hole.strokeIndex,
          }))
        : null,
      p_tees: tees.map((tee) => ({
        name: tee.name,
        courseRating: tee.courseRating,
        slope: tee.slope,
        par: tee.par,
      })),
      p_categories: tournament.categories.map((category) => ({
        id: dbId(category.id),
        name: category.name,
        gender: category.gender,
        minAge: category.minAge,
        maxAge: category.maxAge,
        teeName: teeNameById.get(category.teeId) ?? "",
      })),
      p_flights: tournament.flights.map((flight) => ({
        id: dbId(flight.id),
        categoryName: categoryNameById.get(flight.categoryId) ?? "",
        name: flight.name,
        min: flight.min,
        max: flight.max,
      })),
    });
    if (error) throw new Error(`Could not save the event setup: ${error.message}`);
    const result = data as unknown as { revision?: number } | null;
    if (typeof result?.revision === "number")
      options.revisions?.set(tournament.id, result.revision);
  };

  /** A separate write, so a database without 20261027000000 refuses it with a clear message. */
  const setCourseConfirmed = async (tournamentId: string, confirmed: boolean) => {
    const { error } = await client
      .from("tournaments")
      .update({ course_data_confirmed: confirmed })
      .eq("club_id", clubId)
      .eq("id", tournamentId);
    if (error) {
      const missing = /course_data_confirmed/.test(error.message);
      throw new Error(
        missing
          ? "The database does not have the course-confirmation column yet (migration 20261027000000)."
          : `Could not record the course confirmation: ${error.message}`,
      );
    }
  };

  const setup: Adapters["setup"] = {
    save: ({ tournament, tees, holes }) => {
      // Changing a rating or a hole after the organizer confirmed the card withdraws the confirmation.
      const changed = courseNumbersChanged(
        { tees: state.tees, holes: state.holes },
        { tees, holes },
      );
      const withdraws = changed && tournament.courseDataConfirmed;
      const next = withdraws ? { ...tournament, courseDataConfirmed: false } : tournament;
      dispatch({ type: "saveSetup", tournament: next, tees, holes });
      // A hole card is all or nothing: a blank par or a repeated stroke index is not written.
      const writableHoles = holesComplete(holes) && !strokeIndexProblem(holes) ? holes : null;
      enqueue(async () => {
        await saveSetupRows({
          tournament: next,
          tees,
          holes: writableHoles,
          // Read when the write runs, not when it was queued, so it is the latest known.
          expectedRevision: options.revisions?.get(next.id) ?? null,
        });
        // The event row carries the name, dates, start format, group sizes and registration form.
        // The setup function does not write them, so they are saved here, after it has passed the
        // revision guard (a refused save must not leave half of itself behind).
        await writeTournament(next);
        if (withdraws) await setCourseConfirmed(next.id, false);
      });
    },
    confirmCourse: (tournamentId, confirmed) => {
      const t = state.tournaments.find((x) => x.id === tournamentId);
      if (!t) return;
      dispatch({ type: "saveTournament", tournament: { ...t, courseDataConfirmed: confirmed } });
      enqueue(() => setCourseConfirmed(tournamentId, confirmed));
    },
    revision: () => options.revisions?.get(state.activeTournamentId ?? "") ?? null,
  };

  return { players, tournaments, registrations, imports, router, setup };
}
