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
import { setupPayload } from "@/lib/data/setup-payload";
import { starterSetup } from "@/lib/data/starter";
import type {
  Caddie,
  HandicapRecord,
  Hole,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "@/lib/data/types";
import { OFFLINE_WRITE_NOTICE } from "@/lib/offline/cache";
import type { Tee } from "@/lib/routing";
import {
  type Action,
  activeTournament,
  type DeskState,
  tournamentTemplate,
} from "@/lib/store/state";
import type { Database, Json } from "@/lib/supabase/types";
import { toPlayerInsert, toRegistrationAnswers, toRegistrationInsert } from "./domain";
import { createSupabaseEmailRepository } from "./email";
import { deleteEventLogo, saveEventLogo } from "./event-logo";
import {
  isPhotoDataUrl,
  removeStoredPhoto,
  saveConsentedPhoto,
  setPlayerPhotoConsent,
} from "./players";

/**
 * The draw revision this browser last saw, per tournament.
 *
 * `save_event_setup` and `save_draw` both read and bump the same column,
 * `tournaments.draw_revision`, and both refuse a write that names a stale one. So they have to
 * agree on a single number. They used to keep a counter each — one closed over inside the setup
 * adapter, one in the desk store — and neither told the other. Saving the event setup therefore
 * moved the revision the draw was comparing against, and the next draw save was refused as stale
 * even though nobody else had touched anything.
 */
export interface RevisionStore {
  /** The last revision the database confirmed for this tournament, or null if none is known yet. */
  get: (tournamentId: string) => number | null;
  set: (tournamentId: string, revision: number) => void;
}

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
   * One revision per tournament, shared by the setup and the draw writes. Required rather than
   * optional: a second counter is the bug this exists to prevent, so there is nowhere to put one.
   */
  revisions: RevisionStore;
  /**
   * Called once a new event is fully written (course, event row and setup), so the desk can reload
   * and pick up the database's own ids for its categories and flights.
   */
  onEventCreated?: (tournamentId: string) => void;
  /**
   * False when the phone has no connection or the desk was restored from a saved copy. A write is
   * then refused before it starts and nothing is queued for later.
   */
  canWrite?: () => boolean;
}

const uuid = () => crypto.randomUUID();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Serialises writes so two edits to the same row cannot race. */
export function createQueue(
  options: Pick<SupabaseAdapterOptions, "onError" | "onSaved" | "onBusy" | "canWrite">,
) {
  let pending: Promise<unknown> = Promise.resolve();
  let depth = 0;
  return (work: () => Promise<unknown>) => {
    if (options.canWrite && !options.canWrite()) {
      // Refusing here is the difference between an honest failure and a change that looks saved.
      options.onError(OFFLINE_WRITE_NOTICE);
      return;
    }
    depth += 1;
    options.onBusy(true);
    pending = pending
      .then(work)
      .then(() => {
        options.onSaved();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Could not save the change.";
        const looksOffline =
          (typeof navigator !== "undefined" && navigator.onLine === false) ||
          /failed to fetch|networkerror|network request failed|load failed/i.test(message);
        options.onError(looksOffline ? OFFLINE_WRITE_NOTICE : message);
      })
      .finally(() => {
        depth -= 1;
        if (depth === 0) options.onBusy(false);
      });
    return pending;
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
      if (input.photo && !input.photoConsent) {
        throw new Error("A player photo cannot be saved without recorded consent.");
      }
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
        whsId: input.whsId?.trim() || null,
        photo: input.photo,
        photoConsent: input.photo ? (input.photoConsent ?? false) : undefined,
        photoPublicConsent:
          input.photo && input.photoConsent ? (input.photoPublicConsent ?? false) : undefined,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "addPlayer", player });
      enqueue(async () => {
        const { error } = await client.from("players").insert(toPlayerInsert(player));
        if (error) {
          dispatch({ type: "removePlayer", id: player.id });
          throw new Error(`Could not add the player: ${error.message}`);
        }
        if (!player.photo || !player.photoConsent) return;
        if (!isPhotoDataUrl(player.photo)) {
          throw new Error("A new player photo must be an uploaded image.");
        }
        let saved: Awaited<ReturnType<typeof saveConsentedPhoto>> | null = null;
        try {
          saved = await saveConsentedPhoto(
            client,
            clubId,
            player.id,
            player.photo,
            Boolean(player.photoPublicConsent),
          );
          await setPlayerPhotoConsent(
            client,
            clubId,
            player.id,
            saved.path,
            saved.consentAt,
            saved.publicPath,
            saved.publicConsentAt,
          );
          dispatch({
            type: "updatePlayer",
            id: player.id,
            patch: {
              photoConsent: true,
              photoPublicConsent: Boolean(saved.publicPath),
              photoPublicPath: saved.publicPath,
            },
          });
        } catch (error) {
          if (saved) {
            await removeStoredPhoto(client, clubId, saved.path).catch(() => undefined);
            if (saved.publicPath) {
              await client.storage.from("player-photos-public").remove([saved.publicPath]);
            }
          }
          await client.from("players").delete().eq("club_id", clubId).eq("id", player.id);
          dispatch({ type: "removePlayer", id: player.id });
          throw error;
        }
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
            birthdate: next.birthdate,
            gender: next.gender,
            ngap_id: next.ngapId,
            whs_id: next.whsId ?? null,
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
    setPhoto: async (id, photoDataUrl, consent) => {
      if (!consent.internal) throw new Error("A player photo needs recorded internal consent.");
      if (!isPhotoDataUrl(photoDataUrl)) throw new Error("The photo must be an uploaded image.");
      const stale = await client
        .from("players")
        .select("photo_path, photo_public_path")
        .eq("club_id", clubId)
        .eq("id", id)
        .maybeSingle();
      if (stale.error)
        throw new Error(`Could not read the old player photo: ${stale.error.message}`);
      const saved = await saveConsentedPhoto(client, clubId, id, photoDataUrl, consent.public);
      try {
        await setPlayerPhotoConsent(
          client,
          clubId,
          id,
          saved.path,
          saved.consentAt,
          saved.publicPath,
          saved.publicConsentAt,
        );
      } catch (error) {
        await removeStoredPhoto(client, clubId, saved.path).catch(() => undefined);
        if (saved.publicPath) {
          await client.storage.from("player-photos-public").remove([saved.publicPath]);
        }
        throw error;
      }
      const stalePrivate = stale.data?.photo_path ?? state.photoPaths[id];
      const stalePublic = stale.data?.photo_public_path ?? null;
      if (stalePrivate && stalePrivate !== saved.path) {
        await removeStoredPhoto(client, clubId, stalePrivate).catch(() => undefined);
      }
      if (stalePublic && stalePublic !== saved.publicPath) {
        await client.storage
          .from("player-photos-public")
          .remove([stalePublic])
          .catch(() => undefined);
      }
      dispatch({
        type: "updatePlayer",
        id,
        patch: {
          photo: photoDataUrl,
          photoConsent: true,
          photoPublicConsent: Boolean(saved.publicPath),
          photoPublicPath: saved.publicPath,
        },
      });
      options.onSaved();
    },
    removePhoto: async (id) => {
      const { data: row, error: readError } = await client
        .from("players")
        .select("photo_path, photo_public_path")
        .eq("club_id", clubId)
        .eq("id", id)
        .maybeSingle();
      if (readError) throw new Error(`Could not read the player photo: ${readError.message}`);
      const privatePath = row?.photo_path ?? state.photoPaths[id] ?? null;
      const publicPath =
        row?.photo_public_path ?? state.players.find((p) => p.id === id)?.photoPublicPath ?? null;
      await setPlayerPhotoConsent(client, clubId, id, null, null, null, null);
      if (privatePath) await removeStoredPhoto(client, clubId, privatePath);
      if (publicPath) await client.storage.from("player-photos-public").remove([publicPath]);
      dispatch({
        type: "updatePlayer",
        id,
        patch: {
          photo: undefined,
          photoConsent: false,
          photoPublicConsent: false,
          photoPublicPath: null,
        },
      });
      options.onSaved();
    },
    setPhotoPublicConsent: async (id, consent) => {
      const { data: row, error } = await client
        .from("players")
        .select("photo_path, photo_consent_at, photo_public_path")
        .eq("club_id", clubId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Could not read the player photo: ${error.message}`);
      if (!row) throw new Error("The player was not found.");
      if (!consent) {
        if (row.photo_public_path) {
          await client.storage.from("player-photos-public").remove([row.photo_public_path]);
        }
        await setPlayerPhotoConsent(
          client,
          clubId,
          id,
          row.photo_path,
          row.photo_consent_at,
          null,
          null,
        );
        dispatch({
          type: "updatePlayer",
          id,
          patch: { photoPublicConsent: false, photoPublicPath: null },
        });
        options.onSaved();
        return;
      }
      if (!row.photo_path) throw new Error("Save a consented photo before making it public.");
      let publicPath = row.photo_public_path;
      let uploaded = false;
      if (!publicPath) {
        const { data: file, error: downloadError } = await client.storage
          .from("player-photos")
          .download(row.photo_path);
        if (downloadError || !file) {
          throw new Error(`Could not read the private photo: ${downloadError?.message ?? ""}`);
        }
        publicPath = `${clubId}/${id}.jpg`;
        const { error: uploadError } = await client.storage
          .from("player-photos-public")
          .upload(publicPath, file, { contentType: file.type || "image/jpeg", upsert: true });
        if (uploadError) throw new Error(`Could not publish the photo: ${uploadError.message}`);
        uploaded = true;
      }
      try {
        await setPlayerPhotoConsent(
          client,
          clubId,
          id,
          row.photo_path,
          row.photo_consent_at,
          publicPath,
          new Date().toISOString(),
        );
      } catch (error) {
        if (uploaded) {
          await client.storage
            .from("player-photos-public")
            .remove([publicPath])
            .catch(() => undefined);
        }
        throw error;
      }
      dispatch({
        type: "updatePlayer",
        id,
        patch: { photoPublicConsent: true, photoPublicPath: publicPath },
      });
      options.onSaved();
    },
    setMembership: async (id, type, memberNumber) => {
      const { data, error } = await client.rpc("set_player_membership", {
        p_player: id,
        p_type: type,
        p_member_number: memberNumber ?? null,
      });
      if (error) {
        throw new Error(
          /function .* does not exist/i.test(error.message)
            ? "Membership editing needs migration 20261039000000. Nothing was saved."
            : `Could not save the membership: ${error.message}`,
        );
      }
      const result = data as unknown as { ok?: boolean; message?: string } | null;
      if (!result?.ok) throw new Error(result?.message ?? "The membership was refused.");
      dispatch({
        type: "updatePlayer",
        id,
        patch: {
          membershipType: type,
          memberNumber: type === "member" ? memberNumber?.trim() || null : null,
        },
      });
      options.onSaved();
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
          host_name: tournament.hostName?.trim() || null,
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
    days: (tournamentId) => state.days[tournamentId] ?? [],
    saveDayRule: async (tournamentId, required, max) => {
      const { data, error } = await client.rpc("save_day_rule", {
        p_tournament: tournamentId,
        p_required: required,
        p_max: max,
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "The playing-day rule needs migration 20261037000000. Nothing was saved."
            : `Could not save the day rule: ${error.message}`,
        );
      }
      const result = data as unknown as { ok?: boolean; message?: string } | null;
      if (!result?.ok) throw new Error(result?.message ?? "The day rule was refused.");
      const tournament = state.tournaments.find((t) => t.id === tournamentId);
      if (tournament) {
        dispatch({
          type: "saveTournament",
          tournament: { ...tournament, requiredDays: required, maxDays: max },
        });
      }
    },
    createFromTemplate: (name, date, branding) => {
      // A club with no event yet has no tees or categories to copy, so it starts from the starter
      // setup. Either way the new event gets its own categories and flights (they belong to one
      // event), so ids are left off and the database assigns them; the desk reloads to read them.
      const base = activeTournament(state) ?? state.tournaments[0] ?? null;
      const useStarter = !base || state.tees.length === 0;
      const starter = starterSetup();
      const tees = useStarter ? starter.tees : state.tees;
      const courseId = base?.courseId ?? uuid();
      const dates = branding?.dates?.length ? branding.dates : [date];
      const created: Tournament = {
        ...tournamentTemplate(state, name, date),
        id: uuid(),
        courseId,
        hostName: branding?.hostName?.trim() || null,
        logoUrl: branding?.logo,
        dates,
        config: { ...tournamentTemplate(state, name, date).config, date: dates[0] ?? date },
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
        // The tees, categories and flights go in through the same guarded function the Settings
        // screen uses. No hole list is sent, which leaves the stored card alone: a new event has none.
        const payload = setupPayload(created, tees, [], "all");
        const { data: setupData, error: setupError } = await client.rpc("save_event_setup", {
          p_tournament: created.id,
          p_expected_revision: null,
          ...payload,
          p_registration: payload.p_registration as Json | null,
        });
        fail("Could not set up the event", setupError);
        const revision = (setupData as unknown as { revision?: number } | null)?.revision;
        if (typeof revision === "number") options.revisions.set(created.id, revision);
        if (branding?.logo) {
          const saved = await saveEventLogo(client, clubId, created.id, branding.logo, null);
          dispatch({
            type: "saveTournament",
            tournament: { ...created, logoPath: saved.path, logoUrl: saved.url },
          });
        }
        options.onEventCreated?.(created.id);
      });
      return created;
    },
    setLogo: async (id, logoDataUrl) => {
      const tournament = state.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error("That event was not found.");
      const saved = await saveEventLogo(client, clubId, id, logoDataUrl, tournament.logoPath);
      dispatch({
        type: "saveTournament",
        tournament: { ...tournament, logoPath: saved.path, logoUrl: saved.url },
      });
      options.onSaved();
      return saved.url;
    },
    removeLogo: async (id) => {
      const tournament = state.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error("That event was not found.");
      await deleteEventLogo(client, clubId, id, tournament.logoPath);
      dispatch({
        type: "saveTournament",
        tournament: { ...tournament, logoPath: null, logoUrl: undefined },
      });
      options.onSaved();
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
        selectedDays: input.selectedDays,
        dayTee: {},
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
        if (input.selectedDays.length) {
          const { data, error: dayError } = await client.rpc("set_registration_days", {
            p_registration: entry.id,
            p_days: input.selectedDays,
          });
          if (dayError) {
            const missing =
              dayError.code === "PGRST202" || /function .* does not exist/i.test(dayError.message);
            throw new Error(
              missing
                ? "The registration was written, but the playing days need migration 20261037000000. Edit the entry after it is applied."
                : `Could not save the playing days: ${dayError.message}`,
            );
          }
          const dayResult = data as unknown as { ok?: boolean; message?: string } | null;
          if (!dayResult?.ok)
            throw new Error(dayResult?.message ?? "The playing days were refused.");
        }
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
    setDays: async (entryId, days) => {
      const { data, error } = await client.rpc("set_registration_days", {
        p_registration: entryId,
        p_days: days,
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "The playing days need migration 20261037000000. Nothing was saved."
            : `Could not save the playing days: ${error.message}`,
        );
      }
      const result = data as unknown as { ok?: boolean; message?: string } | null;
      if (!result?.ok) throw new Error(result?.message ?? "The playing days were refused.");
      const entry = state.entries.find((item) => item.id === entryId);
      const caddieByDay = { ...(entry?.caddieByDay ?? {}) };
      for (const key of Object.keys(caddieByDay)) {
        if (!days.includes(Number(key))) delete caddieByDay[Number(key)];
      }
      dispatch({
        type: "updateEntry",
        id: entryId,
        patch: { selectedDays: days, caddieByDay },
      });
    },
    assignDayTee: async (entryId, dayNumber, assignment) => {
      const { data, error } = await client.rpc("assign_registration_day_tee", {
        p_registration: entryId,
        p_day: dayNumber,
        p_tee_time: assignment.teeTime,
        p_start_hole: assignment.startHole,
        p_confirmed: assignment.confirmed,
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "The tee-time assignment needs migration 20261037000000. Nothing was saved."
            : `Could not save the tee time: ${error.message}`,
        );
      }
      const result = data as unknown as { ok?: boolean; message?: string } | null;
      if (!result?.ok) throw new Error(result?.message ?? "The tee time was refused.");
      const entry = state.entries.find((item) => item.id === entryId);
      dispatch({
        type: "updateEntry",
        id: entryId,
        patch: {
          dayTee: {
            ...(entry?.dayTee ?? {}),
            [dayNumber]: assignment,
          },
        },
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
    apply: async (payload) => {
      // A handicap line is not a player profile: it has no reliable birthdate, gender or contact
      // fields for a new directory entry. Refuse before anything is written; the registration
      // import is the path that creates players.
      const unresolved = payload.rows.filter((row) => row.createNew || !row.playerId);
      if (unresolved.length) {
        return {
          ok: false,
          message: `${unresolved.length} row(s) have no player in the directory. Add those players on the Players screen, then re-upload. Nothing was written.`,
        };
      }

      const rows = payload.rows.map((row) => ({
        row: row.row,
        playerId: row.playerId,
        name: row.name,
        ngapId: row.ngapId,
        index: row.index,
        effectiveDate: row.effectiveDate,
      }));
      const deferred = payload.deferred.map((row) => ({
        name: row.name,
        ngapId: row.ngapId,
        index: row.index,
        effectiveDate: row.effectiveDate,
        reason: row.conflicts.concat(row.warnings).join(" ") || "Needs a decision",
        candidatePlayerIds: row.candidates.map((c) => c.playerId),
      }));
      const digest = await sha256Hex(JSON.stringify({ file: payload.fileName, rows, deferred }));
      const key = `handicap:${clubId}:${digest}`;
      const { data, error } = await client.rpc("commit_handicap_import", {
        p_file_name: payload.fileName,
        p_file_sha256: digest,
        p_rows: rows as unknown as Json,
        p_deferred: deferred as unknown as Json,
        p_idempotency_key: key,
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        const message = missing
          ? "The database does not have the import function yet (migration 20261037000000). Nothing was written."
          : `Could not commit the handicap import: ${error.message}`;
        options.onError(message);
        return { ok: false, message };
      }
      const result = (data ?? {}) as {
        ok?: boolean;
        partial?: boolean;
        alreadyCommitted?: boolean;
        message?: string;
        batchId?: string;
        inserted?: number;
        updated?: number;
        rejected?: number;
        rowCount?: number;
      };
      if (result.ok === false && !result.partial) {
        return {
          ok: false,
          message: result.message ?? "The import was refused. Nothing was written.",
        };
      }
      if (result.partial) {
        options.onError(
          `${result.rejected ?? 0} row(s) were rejected and recorded in the batch. The valid rows were committed.`,
        );
      }
      return {
        ok: true,
        partial: Boolean(result.partial),
        alreadyCommitted: Boolean(result.alreadyCommitted),
        batchId: result.batchId,
        inserted: result.inserted ?? 0,
        updated: result.updated ?? 0,
        rejected: result.rejected ?? 0,
      };
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

  /**
   * Records the confirmation on its own, in a separate statement from the event row, so a database
   * that has not applied 20261029000000 refuses it with a message that names the missing migration
   * instead of failing every save.
   */
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
          ? "The database does not have the course-confirmation column yet (migration 20261029000000)."
          : `Could not record the course confirmation: ${error.message}`,
      );
    }
  };

  const setup: Adapters["setup"] = {
    save: ({ tournament, tees, holes, sections = "all" }) => {
      // Changing a rating or a hole after the card was confirmed withdraws the confirmation: what is
      // on screen is then no longer what was checked.
      const changed = courseNumbersChanged(
        { tees: state.tees, holes: state.holes },
        { tees, holes },
      );
      const withdraws = changed && tournament.courseDataConfirmed;
      const next = withdraws ? { ...tournament, courseDataConfirmed: false } : tournament;
      // The draft lands in the session state either way, so a failed write still leaves the edit on
      // screen; the session bar is what says whether it reached the database. saveSetup rather than
      // saveTournament, because the same call carries the tees and holes with it.
      dispatch({ type: "saveSetup", tournament: next, tees, holes });
      // The card is judged inside setupPayload, which sends null rather than inventing a par or a
      // stroke index for a hole nobody has filled in.
      const payload = setupPayload(next, tees, holes, sections);
      enqueue(async () => {
        const { data, error } = await client.rpc("save_event_setup", {
          p_tournament: next.id,
          // Read when the write runs, not when it was queued, so it is the latest known. Null on a
          // first save in a session that never loaded a revision: unguarded, but still atomic.
          p_expected_revision: options.revisions.get(next.id),
          ...payload,
          // The registration document is JSON in the database; the domain type has the same shape.
          p_registration: payload.p_registration as Json | null,
        });
        if (error) throw new Error(`Could not save the event setup: ${error.message}`);
        const result = data as unknown as { revision?: number } | null;
        // The same number the draw writes name. Recording it here is what stops a draw save being
        // refused straight after a setup save.
        if (typeof result?.revision === "number") {
          options.revisions.set(next.id, result.revision);
        }
        // After the guarded write has passed, so a refused save leaves nothing half-done.
        if (withdraws) await setCourseConfirmed(next.id, false);
      });
    },
    confirmCourse: (tournamentId, confirmed) => {
      const t = state.tournaments.find((x) => x.id === tournamentId);
      if (!t) return;
      dispatch({ type: "saveTournament", tournament: { ...t, courseDataConfirmed: confirmed } });
      enqueue(() => setCourseConfirmed(tournamentId, confirmed));
    },
  };

  const caddies: Adapters["caddies"] = {
    list: () => state.caddies,
    add: (input) => {
      const now = new Date().toISOString();
      const caddie: Caddie = {
        id: crypto.randomUUID(),
        clubId,
        fullName: input.fullName.trim(),
        nickname: input.nickname?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        active: true,
        notes: input.notes?.trim() || null,
        createdAt: now,
        updatedAt: now,
      };
      if (!caddie.fullName) throw new Error("A caddie needs a name.");
      dispatch({ type: "addCaddie", caddie });
      enqueue(async () => {
        const { error } = await client.from("caddies").insert({
          id: caddie.id,
          club_id: clubId,
          full_name: caddie.fullName,
          nickname: caddie.nickname,
          phone: caddie.phone,
          email: caddie.email,
          active: true,
          notes: caddie.notes,
        });
        fail("Could not add the caddie", error);
      });
      return caddie;
    },
    update: (id, patch) => {
      if (patch.active === false) {
        const assigned = state.entries.some((entry) =>
          Object.values(entry.caddieByDay ?? {}).some((assignment) => assignment.caddieId === id),
        );
        if (assigned) {
          throw new Error(
            "This caddie still has an active assignment. Clear or reassign it first.",
          );
        }
      }
      dispatch({ type: "updateCaddie", id, patch });
      const next = { ...(state.caddies.find((c) => c.id === id) as Caddie), ...patch, id };
      enqueue(async () => {
        const { error } = await client
          .from("caddies")
          .update({
            full_name: next.fullName,
            nickname: next.nickname,
            phone: next.phone,
            email: next.email,
            active: next.active,
            notes: next.notes,
          })
          .eq("club_id", clubId)
          .eq("id", id);
        fail("Could not save the caddie", error);
      });
    },
    remove: (id) => {
      const assigned = state.entries.some((entry) =>
        Object.values(entry.caddieByDay ?? {}).some((assignment) => assignment.caddieId === id),
      );
      if (assigned) {
        throw new Error("This caddie still has an active assignment. Clear or reassign it first.");
      }
      dispatch({ type: "removeCaddie", id });
      enqueue(async () => {
        const { error } = await client.from("caddies").delete().eq("club_id", clubId).eq("id", id);
        fail("Could not remove the caddie", error);
      });
    },
    assign: async (entryId, dayNumber, caddieId) => {
      const { data, error } = await client.rpc("assign_caddie", {
        p_registration: entryId,
        p_day: dayNumber,
        p_caddie: caddieId,
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "Caddie assignment needs migration 20261039000000. Nothing was saved."
            : `Could not save the caddie assignment: ${error.message}`,
        );
      }
      const result = data as unknown as {
        ok?: boolean;
        message?: string;
        caddieName?: string | null;
      } | null;
      if (!result?.ok) throw new Error(result?.message ?? "The caddie assignment was refused.");
      const entry = state.entries.find((item) => item.id === entryId);
      const next = { ...(entry?.caddieByDay ?? {}) };
      if (!caddieId) {
        delete next[dayNumber];
      } else {
        next[dayNumber] = {
          caddieId,
          caddieName: result.caddieName ?? "Caddie",
          status: "assigned",
        };
      }
      dispatch({ type: "updateEntry", id: entryId, patch: { caddieByDay: next } });
    },
  };

  const email = createSupabaseEmailRepository(client, state, clubId);

  return { players, tournaments, registrations, caddies, email, imports, router, setup };
}
