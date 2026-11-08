/**
 * Supabase-backed adapters.
 *
 * The `Adapters` interface is synchronous because every screen already calls it that way. So the
 * shape here is: reads come from the hydrated desk state (one read on load), and writes are queued
 * to Supabase. What the screen shows is decided per write: a control that must answer a tap at once
 * (a payment status) is applied immediately and put back if the database refuses it, while a save
 * that can wait for its own answer (the event setup, the manual override) is shown only after the
 * write lands. A failed write is reported through `onError` so the provider can show it, rather than
 * pretending the save happened.
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
import { displayName } from "@/lib/format";
import { OFFLINE_WRITE_NOTICE } from "@/lib/offline/cache";
import type { Tee } from "@/lib/routing";
import {
  type Action,
  activeTournament,
  type DeskState,
  tournamentTemplate,
} from "@/lib/store/state";
import type { Database, Json } from "@/lib/supabase/types";
import { detachDroppedClassGroups } from "./classes";
import { toPlayerInsert, toRegistrationAnswers } from "./domain";
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
  /**
   * The desk state as it is now, including actions the provider dispatched since this adapter was
   * built. The provider rebuilds the adapters on every render, but a queued write can finish after
   * a later edit, so a rollback must compare against the newest state rather than the render the
   * adapter was made from. Falls back to the state the adapter was built with when absent.
   */
  currentState?: () => DeskState;
}

/**
 * The part of `applied` that may be put back to its `saved` value after a refused write.
 *
 * Only a field that still holds exactly what the refused write set is restored. A field a later
 * edit has changed is left alone, so a queued refusal cannot erase work that came after it. The
 * comparison is by identity, which is what the reducer preserves: an action that changes a field
 * stores a new value, and one that does not change it keeps the same reference.
 */
function refusedPart<T extends object>(
  current: T | null | undefined,
  applied: Partial<T>,
  saved: T,
): Partial<T> {
  if (!current) return {};
  const restore: Record<string, unknown> = {};
  for (const key of Object.keys(applied)) {
    const field = key as keyof T;
    if (Object.is(current[field], applied[field])) restore[key] = saved[field];
  }
  return restore as Partial<T>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The members of `next` that differ from `was`, so a nested document is merged, not replaced. */
function changedMembers(
  was: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (!Object.is(was[key], next[key])) changed[key] = next[key];
  }
  return changed;
}

/**
 * The event to show once a setup save lands, laid over the event as it is now.
 *
 * That dispatch now happens after the round trip, so another edit to the same event (a course
 * confirmation, a day rule) can arrive first. Only the fields this save really changed are taken
 * from the new draft; every other field stays as it is now, so the later edit is not put back.
 */
function shownSetup(before: Tournament | null, saved: Tournament, current: Tournament): Tournament {
  if (!before) return saved;
  const shown: Record<string, unknown> = { ...current };
  for (const key of Object.keys(saved) as (keyof Tournament)[]) {
    const was = before[key] as unknown;
    const now = saved[key] as unknown;
    if (Object.is(was, now)) continue;
    shown[key] =
      isRecord(was) && isRecord(now) && isRecord(current[key])
        ? { ...(current[key] as Record<string, unknown>), ...changedMembers(was, now) }
        : now;
  }
  return shown as unknown as Tournament;
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

/** A response from a function the generated types do not describe yet. */
interface UnlistedRpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/**
 * Calls a database function that `src/lib/supabase/types.ts` does not list yet.
 *
 * `create_registration` arrives in migration 20261104000000, and the types are generated from a
 * project that has the migration applied, so they cannot be updated before it runs. Keeping the one
 * cast here means the rest of the adapter stays typed; the arguments are named at the call site.
 */
function callUnlisted(
  client: SupabaseClient<Database>,
  name: string,
  args: Record<string, unknown>,
): PromiseLike<UnlistedRpcResult> {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<UnlistedRpcResult>;
  return rpc(name, args);
}

export function createSupabaseAdapters(
  state: DeskState,
  dispatch: Dispatch<Action>,
  options: SupabaseAdapterOptions,
): Adapters {
  const { client, clubId } = options;
  const enqueue = createQueue(options);
  // The newest state, so a write that lands late reads what is on screen now and not the render it
  // was queued from.
  const latestState = options.currentState ?? (() => state);
  // The pure parts (CSV parsing, the merge queue, the routing explanation) read the same hydrated
  // state, so they reuse the mock implementation rather than duplicating it.
  const mock = createMockAdapters(state, dispatch);

  /**
   * Queues a write and hands back a promise that settles with it.
   *
   * `createQueue` reports a failure through `onError` and then resolves, which suits a background
   * save but not a screen that must not claim a row was saved. This wraps the same work and keeps
   * the rejection for the caller. The queue still reports it too, so the session bar and the caller
   * cannot disagree. A screen that does not wait is unaffected.
   */
  function queuedWrite(work: () => Promise<void>): Promise<void> {
    let resolveWrite!: () => void;
    let rejectWrite!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveWrite = resolve;
      rejectWrite = reject;
    });
    // A caller may ignore the promise. The rejection is still delivered to one that awaits; this
    // only stops an ignored one from surfacing as an unhandled rejection.
    void done.catch(() => undefined);
    // The queue refuses the same way, but it would then never run the work and this promise would
    // never settle. Refusing before the queue keeps the caller's error immediate and final.
    if (options.canWrite && !options.canWrite()) {
      options.onError(OFFLINE_WRITE_NOTICE);
      rejectWrite(new Error(OFFLINE_WRITE_NOTICE));
      return done;
    }
    enqueue(async () => {
      try {
        await work();
        resolveWrite();
      } catch (error) {
        rejectWrite(error);
        throw error;
      }
    });
    return done;
  }

  /**
   * Saves one player's retired state, then applies the same values to the loaded list.
   *
   * The two columns arrived with migration 20261105000300. A database without them answers with a
   * schema error, which is said plainly rather than left looking like a network fault.
   */
  function writePlayerState(
    id: string,
    row: { active: boolean; deleted_at?: string | null },
    patch: { active: boolean; deletedAt?: string | null },
  ) {
    return queuedWrite(async () => {
      const { data, error } = await client
        .from("players")
        .update(row)
        .eq("club_id", clubId)
        .eq("id", id)
        .select("id");
      if (error) {
        throw new Error(
          /column .* does not exist|schema cache/i.test(error.message)
            ? "Player disable and delete need migration 20261105000300. Nothing was saved."
            : `Could not save the player state: ${error.message}`,
        );
      }
      if (!data || data.length === 0) {
        throw new Error("That player is no longer in the directory. Reload the page.");
      }
      dispatch({ type: "updatePlayer", id, patch });
    });
  }

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
      const fullName = `${first} ${last}`.trim() || "Unnamed player";
      const player: PlayerRecord = {
        id: uuid(),
        clubId,
        firstName: first,
        lastName: last,
        nickname: input.nickname?.trim() || null,
        name: displayName(fullName),
        fullName,
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
      const saved = queuedWrite(async () => {
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
      // A refusal before the work runs (offline) never reaches the cleanup above, so take the
      // optimistic row off the list for any rejection.
      void saved.catch(() => dispatch({ type: "removePlayer", id: player.id }));
      return { ...player, saved };
    },
    update: (id, patch) => {
      dispatch({ type: "updatePlayer", id, patch });
      const next = { ...(state.players.find((p) => p.id === id) as PlayerRecord), ...patch, id };
      enqueue(async () => {
        const { error } = await client
          .from("players")
          .update({
            full_name: next.fullName ?? next.name,
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
    linkAccount: async (id, email) => {
      const { data, error } = await callUnlisted(client, "link_player_account", {
        p_player: id,
        p_email: email.trim(),
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "Linking an account needs migration 20261104000300. Nothing was saved."
            : `Could not link the account: ${error.message}`,
        );
      }
      const result = data as unknown as { ok?: boolean; message?: string } | null;
      if (!result?.ok) throw new Error(result?.message ?? "The account was not linked.");
      options.onSaved();
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
    setActive: (id, active) => writePlayerState(id, { active }, { active }),
    softDelete: (id) => {
      const deletedAt = new Date().toISOString();
      return writePlayerState(
        id,
        { active: false, deleted_at: deletedAt },
        { active: false, deletedAt },
      );
    },
    restore: (id) =>
      writePlayerState(id, { active: true, deleted_at: null }, { active: true, deletedAt: null }),
    remove: (id) => {
      // Delete first, then take the row off the list. `players` has a before-delete guard that
      // refuses a player who still has registrations or scoring rows, and the database message is
      // the only honest answer to "did it work?". Removing the row here first would show the player
      // as gone while the database still holds them.
      return queuedWrite(async () => {
        const { error } = await client.from("players").delete().eq("club_id", clubId).eq("id", id);
        if (error) throw new Error(`Could not remove the player: ${error.message}`);
        dispatch({ type: "removePlayer", id });
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
      return queuedWrite(async () => {
        // The event-level fields travel through the guarded setup function, not a direct upsert.
        // That function is the only writer that bumps draw_revision, so changing the days of play
        // here marks an already-drawn board stale in the same transaction. A direct table write
        // left the board looking current after the dates had moved.
        //
        // Only the Basics block is sent. The calendar is the caller and it edits name, host, days
        // and state; anything else in the passed event is not this write's business.
        const payload = setupPayload(tournament, [], [], ["basics"]);
        const { data, error } = await client.rpc("save_event_setup", {
          p_tournament: tournament.id,
          p_expected_revision: options.revisions.get(tournament.id),
          ...payload,
          p_registration: payload.p_registration as Json | null,
        });
        if (error) throw new Error(`Could not save the event: ${error.message}`);
        const revision = (data as unknown as { revision?: number } | null)?.revision;
        if (typeof revision === "number") options.revisions.set(tournament.id, revision);

        // The host is the one calendar field the setup document does not carry. It has no effect
        // on routing, so it is written to its own column after the guarded write has passed.
        const { error: hostError } = await client
          .from("tournaments")
          .update({ host_name: tournament.hostName?.trim() || null })
          .eq("club_id", clubId)
          .eq("id", tournament.id);
        fail("Could not save the event host", hostError);
      });
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
    setDayStart: async (tournamentId, dayNumber, time) => {
      const write = () =>
        client
          .from("tournament_days")
          .update({ start_time: time })
          .eq("club_id", clubId)
          .eq("tournament_id", tournamentId)
          .eq("day_number", dayNumber)
          .select("id");
      const { data, error } = await write();
      if (error) {
        // The column and table both arrive with 20261037000000; a database without it is a
        // supported state that says so instead of failing with the raw message.
        const missing =
          error.code === "42P01" ||
          error.code === "42703" ||
          /does not exist|schema cache/i.test(error.message);
        throw new Error(
          missing
            ? "Day start times need migration 20261037000000. Nothing was saved."
            : `Could not save the start time for that day: ${error.message}`,
        );
      }
      if (!data?.length) {
        throw new Error(
          "This event has no stored row for that day. Save the event dates in Settings first.",
        );
      }
      dispatch({ type: "setDayStart", tournamentId, dayNumber, time });
      options.onSaved();
    },
    setDayPmStart: async (tournamentId, dayNumber, time) => {
      const write = () =>
        client
          .from("tournament_days")
          .update({ pm_start_time: time })
          .eq("club_id", clubId)
          .eq("tournament_id", tournamentId)
          .eq("day_number", dayNumber)
          .select("id");
      const { data, error } = await write();
      if (error) {
        // The column arrives with 20261108000800; a database without it is a supported state that
        // says so instead of failing with the raw message.
        const missing =
          error.code === "42P01" ||
          error.code === "42703" ||
          /does not exist|schema cache/i.test(error.message);
        throw new Error(
          missing
            ? "The afternoon start needs migration 20261108000800. Nothing was saved."
            : `Could not save the afternoon start for that day: ${error.message}`,
        );
      }
      if (!data?.length) {
        throw new Error(
          "This event has no stored row for that day. Save the event dates in Settings first.",
        );
      }
      dispatch({ type: "setDayPmStart", tournamentId, dayNumber, time });
      options.onSaved();
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
      const saved = queuedWrite(async () => {
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
            type: "setTournamentLogo",
            id: created.id,
            logoPath: saved.path,
            logoUrl: saved.url,
          });
        }
        options.onEventCreated?.(created.id);
      });
      return { ...created, saved };
    },
    setLogo: async (id, logoDataUrl) => {
      const tournament = state.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error("That event was not found.");
      const saved = await saveEventLogo(client, clubId, id, logoDataUrl, tournament.logoPath);
      dispatch({
        type: "setTournamentLogo",
        id,
        logoPath: saved.path,
        logoUrl: saved.url,
      });
      options.onSaved();
      return saved.url;
    },
    removeLogo: async (id) => {
      const tournament = state.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error("That event was not found.");
      await deleteEventLogo(client, clubId, id, tournament.logoPath);
      dispatch({
        type: "setTournamentLogo",
        id,
        logoPath: null,
        logoUrl: undefined,
      });
      options.onSaved();
    },
  };

  /**

   * Registrations ------------------------------------------------------------------------------ */

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

      // One function writes the registration and its days (migration 20261104000000). Two requests
      // meant the deferred day rule could refuse the insert after the screen had already said the
      // entry was saved. The entry carries the write as `saved`, so the register screen can wait for
      // the database before it shows the saved state.
      //
      // The optimistic row comes off the screen exactly once, whichever way the write fails: the
      // pre-flight refusal below, the RPC error, or a refusal in the payload. `dropped` makes the
      // rollback idempotent so the action does not fire twice for one failure.
      let dropped = false;
      const drop = () => {
        if (dropped) return;
        dropped = true;
        dispatch({ type: "removeEntry", id: entry.id });
      };
      const saved = queuedWrite(async () => {
        const { data, error } = await callUnlisted(client, "create_registration", {
          p_id: entry.id,
          p_tournament: tournamentId,
          p_player: entry.playerId,
          p_answers: toRegistrationAnswers(entry) as Json,
          p_days: input.selectedDays,
          p_frozen_index: entry.frozen.index,
          p_frozen_record_id: entry.frozen.recordId,
          p_frozen_effective_date: entry.frozen.effectiveDate,
          p_frozen_at: entry.frozen.frozenAt,
          p_payment_status:
            entry.paymentStatus === "recorded_paid"
              ? "paid"
              : entry.paymentStatus === "waived"
                ? "waived"
                : "unpaid",
        });
        if (error) {
          // Nothing reached the database, so the optimistic entry comes off the screen too.
          drop();
          const missing =
            error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
          throw new Error(
            missing
              ? "The registration needs migration 20261104000000. Nothing was saved."
              : `Could not register the player: ${error.message}`,
          );
        }
        const result = (data ?? {}) as { ok?: boolean; message?: string };
        if (!result.ok) {
          drop();
          throw new Error(result.message ?? "The registration was refused. Nothing was saved.");
        }
      });
      // The pre-flight refusal (offline) never runs the work above, so roll the optimistic entry
      // back for any rejection. `drop` is idempotent, so this cannot remove it twice.
      void saved.catch(drop);

      // Typed so the extra `saved` handle survives the repository's `RegistrationEntry` return
      // type; a screen that only needs the row can ignore it.
      const created: RegistrationEntry & { saved: Promise<void> } = { ...entry, saved };
      return created;
    },
    update: (id, patch) => {
      const previous = latestState().entries.find((e) => e.id === id) ?? null;
      // Shown at once, so an inline control answers the tap. The refusal below puts back exactly
      // the fields this write set, and only those still holding the value it set.
      dispatch({ type: "updateEntry", id, patch });
      // The screen can wait for the row. A refused write puts the old values back, so an inline
      // payment control never keeps showing a change the database rejected.
      const write = queuedWrite(async () => {
        // Read the row when the write runs, not when it was queued: an earlier edit in the queue
        // has been applied by now, and this write must carry it rather than overwrite it.
        const row = latestState().entries.find((e) => e.id === id) ?? previous;
        if (!row) throw new Error("That registration is no longer in this event. Reload the page.");
        const { error } = await client
          .from("registrations")
          .update({
            payment_status:
              row.paymentStatus === "recorded_paid"
                ? "paid"
                : row.paymentStatus === "waived"
                  ? "waived"
                  : "unpaid",
            answers: toRegistrationAnswers(row) as Json,
          })
          .eq("club_id", clubId)
          .eq("id", id);
        if (error) throw new Error(`Could not save the registration: ${error.message}`);
      });
      // Any rejection puts the fields back, including the offline refusal, which never runs the
      // work above. It is idempotent: after the first restore a field no longer holds the value
      // this write set, so a second pass leaves it alone.
      void write.catch(() => {
        if (!previous) return;
        const now = latestState().entries.find((e) => e.id === id);
        const restore = refusedPart(now, patch, previous);
        if (Object.keys(restore).length > 0) {
          dispatch({ type: "updateEntry", id, patch: restore });
        }
      });
      return write;
    },
    overrideReady: (entryId, input) => {
      const entry = latestState().entries.find((item) => item.id === entryId);
      if (!entry) throw new Error("That registration was not found.");
      const frozenAt = new Date().toISOString();
      // Only the facts the override supplies. Sending the whole entry back would put an older
      // payment status or caddie assignment over one that changed while this write was queued.
      const patch: Partial<RegistrationEntry> = {
        status: "ok",
        reasons: input.pending,
        frozen: {
          index: input.index,
          recordId: null,
          effectiveDate: input.effectiveDate,
          frozenAt,
        },
        categoryId: input.categoryId,
        teeId: input.teeId,
        flightId: input.flightId,
        playingHandicap: input.playingHandicap,
        overridden: true,
        overrideReason: input.reason,
      };
      // Nothing changes on screen until both rows are written. A refused override must not leave
      // the desk showing a player as ready when the database still says needs review.
      return queuedWrite(async () => {
        // A guest's birthdate may never arrive. Only write the player record when the desk supplied
        // one; a blank field must not wipe a date that is already on file.
        if (input.birthdate) {
          const { error: playerError } = await client
            .from("players")
            .update({ birthdate: input.birthdate })
            .eq("club_id", clubId)
            .eq("id", entry.playerId);
          if (playerError) {
            throw new Error(`Could not save the player's birthdate: ${playerError.message}`);
          }
          // That row is saved now, so it is shown even if the registration write below is refused:
          // the date is on file, and a later player save must not write an older one back.
          dispatch({
            type: "updatePlayer",
            id: entry.playerId,
            patch: { birthdate: input.birthdate },
          });
        }
        // The stored answers are the whole row, so read the newest one: any field edited while this
        // override waited in the queue travels with it instead of being written back.
        const row: RegistrationEntry = {
          ...(latestState().entries.find((item) => item.id === entryId) ?? entry),
          ...patch,
        };
        const { error } = await client
          .from("registrations")
          .update({
            status: "ok",
            reasons: input.pending,
            frozen_index: input.index,
            frozen_record_id: null,
            frozen_effective_date: input.effectiveDate,
            frozen_at: frozenAt,
            category_id: input.categoryId,
            tee_id: input.teeId,
            playing_handicap: input.playingHandicap,
            flight_id: input.flightId,
            overridden: true,
            answers: toRegistrationAnswers(row) as Json,
          })
          .eq("club_id", clubId)
          .eq("id", entryId);
        fail("Could not mark the player ready", error);
        dispatch({ type: "updateEntry", id: entryId, patch });
      });
    },
    remove: (id) => {
      const entry = state.entries.find((e) => e.id === id) ?? null;
      dispatch({ type: "removeEntry", id });
      // The screen can wait for this: a refused delete puts the row back instead of leaving it
      // missing from the list while it is still in the database.
      return queuedWrite(async () => {
        const { error } = await client
          .from("registrations")
          .delete()
          .eq("club_id", clubId)
          .eq("id", id);
        if (error) {
          if (entry) dispatch({ type: "addEntry", entry });
          throw new Error(`Could not remove the registration: ${error.message}`);
        }
      });
    },
    refreeze: (tournamentId, entryIds) => {
      const tournament = tournaments.get(tournamentId);
      const targets = state.entries.filter(
        (e) => e.tournamentId === tournamentId && (!entryIds || entryIds.includes(e.id)),
      );
      if (targets.length === 0) return;
      // The new index is shown only after the row is written. A refused write leaves the old index
      // on screen, which is the truth: it is still what the event is routing against.
      return queuedWrite(async () => {
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
          dispatch({ type: "refreeze", tournamentId, entryIds: [entry.id] });
        }
      });
    },
    confirmMany: async (tournamentId, entryIds) => {
      if (entryIds.length === 0) return 0;
      const { data, error } = await callUnlisted(client, "confirm_registrations", {
        p_tournament: tournamentId,
        p_ids: entryIds,
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "Bulk confirmation needs migration 20261104000600. Nothing was changed."
            : `Could not confirm the registrations: ${error.message}`,
        );
      }
      // The function returns the number of rows it actually changed. A row that was already ok, or
      // outside this event, is not counted, so the screen reports the database's answer.
      const count = typeof data === "number" ? data : Number(data ?? 0);
      if (!Number.isFinite(count)) throw new Error("The database did not say how many changed.");
      options.onSaved();
      return count;
    },
    setDays: async (entryId, days, sessions = {}) => {
      const { data, error } = await client.rpc("set_registration_days", {
        p_registration: entryId,
        p_days: days,
        p_sessions: sessions,
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "Saving the days with their AM/PM session needs migration 20261105000100. Nothing was saved."
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
        patch: { selectedDays: days, daySessions: sessions, caddieByDay },
      });
    },
    assignDayTee: async (entryId, dayNumber, assignment) => {
      const { data, error } = await client.rpc("assign_registration_day_tee", {
        p_registration: entryId,
        p_day: dayNumber,
        p_tee_time: assignment.teeTime,
        p_start_hole: assignment.startHole,
        p_confirmed: assignment.confirmed,
        p_wave: assignment.wave,
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "The tee-time assignment needs migration 20261037000000 and its wave column needs 20261104001100. Nothing was saved."
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
    checkIn: async (entryId, dayNumber, arrived) => {
      // Unlisted on purpose: the generated database types cannot know a function that ships in the
      // same change as this screen.
      const { data, error } = await callUnlisted(client, "set_entry_day_check_in", {
        p_registration: entryId,
        p_day_number: dayNumber,
        p_arrived: arrived,
      });
      if (error) {
        const missing =
          error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
        throw new Error(
          missing
            ? "Recording arrivals needs migration 20261106000000. Nothing was saved."
            : /not entered for that day/i.test(error.message)
              ? "That player is not entered for this day."
              : `Could not record the arrival: ${error.message}`,
        );
      }
      const result = data as unknown as {
        ok?: boolean;
        message?: string;
        checked_in_at?: string | null;
      } | null;
      if (!result?.ok) {
        throw new Error(result?.message ?? "The arrival was refused. Nothing was saved.");
      }
      const entry = state.entries.find((item) => item.id === entryId);
      const next = { ...(entry?.dayCheckIn ?? {}) };
      if (arrived) {
        next[dayNumber] = { at: result.checked_in_at ?? new Date().toISOString(), byName: null };
      } else {
        delete next[dayNumber];
      }
      dispatch({ type: "updateEntry", id: entryId, patch: { dayCheckIn: next } });
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
      // on screen is then no longer what was checked. A save that does not carry the course has not
      // compared anything, so it cannot withdraw the card.
      const touchesCourse = sections === "all" || sections.includes("course");
      const changed =
        touchesCourse &&
        courseNumbersChanged({ tees: state.tees, holes: state.holes }, { tees, holes });
      const withdraws = changed && tournament.courseDataConfirmed;
      const next = withdraws ? { ...tournament, courseDataConfirmed: false } : tournament;
      // The card is judged inside setupPayload, which sends null rather than inventing a par or a
      // stroke index for a hole nobody has filled in.
      const payload = setupPayload(next, tees, holes, sections);
      // The event as this adapter was built, so only the fields this save changed are taken from
      // the new draft when it lands.
      const stored = state.tournaments.find((item) => item.id === next.id) ?? null;
      // Nothing is shown until the guarded write has passed. A refused save then leaves the last
      // saved setup on screen, while the Settings draft keeps the edit for a retry.
      let applied = false;
      const write = queuedWrite(async () => {
        // A class row this save is removing can still be named by a group on the board, and the
        // database refuses to delete an in-use class: it skips the row and the row comes back on the
        // next reload. Move those groups onto the class that replaces it first, and only when this
        // save really drops a row, so a rename or a range edit touches no group at all.
        const keepIds = new Set(next.flights.map((flight) => flight.id));
        const storedFlights = state.tournaments.find((item) => item.id === next.id)?.flights ?? [];
        const droppingClass = storedFlights.some((flight) => !keepIds.has(flight.id));
        if ((sections === "all" || sections.includes("flights")) && droppingClass) {
          await detachDroppedClassGroups(client, next.id, [...keepIds]);
        }
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
        // Shown only now, when the database has the change. saveSetup rather than saveTournament,
        // because the same call carries the tees and holes with it.
        applied = true;
        const current = latestState().tournaments.find((item) => item.id === next.id) ?? next;
        dispatch({ type: "saveSetup", tournament: shownSetup(stored, next, current), tees, holes });
        // After the guarded write has passed, so a refused setup leaves nothing half-done.
        if (withdraws) await setCourseConfirmed(next.id, false);
      });
      if (withdraws) {
        // Two different failures. If the setup write itself was refused, nothing was dispatched and
        // the last saved setup stays on screen with its confirmation. If the numbers landed but the
        // confirmation-only write was refused, the database still says confirmed, so put that back
        // on screen to match it. Read the event now, not the call-time draft.
        void write.catch(() => {
          if (!applied) return;
          const now = latestState().tournaments.find((item) => item.id === next.id);
          if (!now) return;
          dispatch({
            type: "saveTournament",
            tournament: { ...now, courseDataConfirmed: true },
          });
        });
      }
      return write;
    },
    confirmCourse: (tournamentId, confirmed) => {
      if (!latestState().tournaments.some((x) => x.id === tournamentId)) return;
      // Written first, shown after. The tick on the Settings screen is that screen's own draft; the
      // desk must not claim a confirmation the database refused.
      return queuedWrite(async () => {
        await setCourseConfirmed(tournamentId, confirmed);
        const saved = latestState().tournaments.find((x) => x.id === tournamentId);
        if (saved) {
          dispatch({
            type: "saveTournament",
            tournament: { ...saved, courseDataConfirmed: confirmed },
          });
        }
      });
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
      const saved = queuedWrite(async () => {
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
        if (error) {
          // Nothing reached the database, so the optimistic row comes off the list too.
          dispatch({ type: "removeCaddie", id: caddie.id });
          throw new Error(`Could not add the caddie: ${error.message}`);
        }
      });
      void saved.catch(() => dispatch({ type: "removeCaddie", id: caddie.id }));
      return { ...caddie, saved };
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
      const previous = state.caddies.find((c) => c.id === id) ?? null;
      dispatch({ type: "updateCaddie", id, patch });
      const next = { ...(state.caddies.find((c) => c.id === id) as Caddie), ...patch, id };
      return queuedWrite(async () => {
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
        if (error) {
          if (previous) dispatch({ type: "updateCaddie", id, patch: previous });
          throw new Error(`Could not save the caddie: ${error.message}`);
        }
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
