/**
 * The rules for the offline snapshots: which key they live under, how long they may be trusted,
 * what is removed before a desk snapshot is written, and the words the screen uses to say it is
 * showing a saved copy.
 *
 * Everything here is a plain function of its arguments. The browser storage itself is in
 * `store.ts`, so the rules can be tested in Node and shared by the desk and the player area.
 */
import type { LoadedDesk } from "@/lib/data/supabase/load-desk-state";
import type { PlayerRecord } from "@/lib/data/types";
import type { PortalState } from "@/lib/player/portal";
import type { DeskState } from "@/lib/store/state";

/** Bumped when a stored shape changes. An older snapshot is ignored rather than half-read. */
export const OFFLINE_SCHEMA_VERSION = 1;

/**
 * A snapshot older than this is not shown at all. A month is long enough to cover an event week
 * with no signal, and short enough that a phone left in a drawer does not keep a season of names.
 */
export const OFFLINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type SnapshotKind = "desk" | "player";

export interface DeskSnapshot {
  state: DeskState;
  clubName: string;
  /** The draw revisions that were current when the snapshot was read. */
  revisions: Record<string, number>;
  member: { displayName: string; role: "owner" | "organizer" | "desk" } | null;
}

/** What is written around any cached payload. `userId` keeps one account's cache apart from another. */
export interface SnapshotEnvelope<T> {
  schema: number;
  savedAt: string;
  userId: string;
  clubId: string | null;
  payload: T;
}

export const snapshotKey = (kind: SnapshotKind, userId: string): string =>
  kind === "desk" ? `desk:${userId}` : `player:${userId}`;

/**
 * A desk snapshot is the desk's whole working read, which is exactly what every desk screen draws
 * from. Photos are not part of it: they are consent-gated, fetched as short-lived signed URLs, and
 * must not sit in a cache this app does not control. The URL is dropped here, before storage.
 */
export function stripPlayerPhoto(player: PlayerRecord): PlayerRecord {
  if (!player.photo && !player.photoPublicPath) return player;
  const { photo: _photo, photoPublicPath: _public, ...rest } = player;
  return rest;
}

export function toDeskSnapshot(loaded: LoadedDesk, member: DeskSnapshot["member"]): DeskSnapshot {
  return {
    clubName: loaded.clubName,
    revisions: loaded.revisions,
    member,
    state: {
      ...loaded.state,
      players: loaded.state.players.map(stripPlayerPhoto),
    },
  };
}

export function toPlayerSnapshot(state: PortalState): PortalState {
  // The portal projection already carries no photo, phone number or date of birth. The copy is
  // still made explicitly so a future field cannot slip in unnoticed.
  return {
    linked: state.linked,
    player: state.player
      ? { id: state.player.id, name: state.player.name, ngapId: state.player.ngapId }
      : null,
    entries: state.entries.map((entry) => ({
      ...entry,
      reasons: [...entry.reasons],
      dates: [...entry.dates],
      start: entry.start ? { ...entry.start } : null,
    })),
  };
}

export function isSnapshotCurrent(savedAt: string, now: Date): boolean {
  const saved = Date.parse(savedAt);
  if (!Number.isFinite(saved)) return false;
  return now.getTime() - saved <= OFFLINE_MAX_AGE_MS;
}

/** Reads a stored envelope, refusing a different schema or a different account. */
export function readEnvelope<T>(
  raw: unknown,
  options: { kind: SnapshotKind; userId: string; now: Date },
): SnapshotEnvelope<T> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw as Partial<SnapshotEnvelope<T>>;
  if (value.schema !== OFFLINE_SCHEMA_VERSION) return null;
  if (value.userId !== options.userId) return null;
  if (typeof value.savedAt !== "string") return null;
  if (!isSnapshotCurrent(value.savedAt, options.now)) return null;
  if (typeof value.payload !== "object" || value.payload === null) return null;
  return {
    schema: OFFLINE_SCHEMA_VERSION,
    savedAt: value.savedAt,
    userId: value.userId,
    clubId: typeof value.clubId === "string" ? value.clubId : null,
    payload: value.payload,
  };
}

const clock = (date: Date): string => {
  const hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${suffix}`;
};

/** "18 Oct", or "18 Oct 2025" once the year differs, in the phone's own time zone. */
export function savedDateLabel(savedAt: string, now: Date): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-GB", { month: "short" });
  return date.getFullYear() === now.getFullYear()
    ? `${day} ${month}`
    : `${day} ${month} ${date.getFullYear()}`;
}

/**
 * The sentence every screen showing a saved copy must carry. It names the clock time, never a
 * vague "recently", and it says plainly that the phone is not connected.
 */
export function offlineNotice(savedAt: string, now: Date = new Date()): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) {
    return "Showing the last saved copy. The time it was saved is not available. Not connected.";
  }
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const when = sameDay
    ? `at ${clock(date)}`
    : `on ${savedDateLabel(savedAt, now)} at ${clock(date)}`;
  return `Showing what was on screen ${when}. Not connected.`;
}

/** The line used when the phone has no connection but no saved copy exists yet. */
export const NO_SNAPSHOT_NOTICE =
  "This page has not been saved on this phone yet, so there is nothing to show offline. Reconnect once to save it.";

/** The desk equivalent, shown where the retry banner would appear. */
export const NO_DESK_SNAPSHOT_NOTICE =
  "The tournament desk could not be reached and no saved copy is on this phone. Reconnect to load it.";

/** Shown when a desk change is attempted with no connection. Nothing is queued. */
export const OFFLINE_WRITE_NOTICE =
  "You are offline, so this change was not saved. Nothing is queued and nothing is sent later. Reconnect, then try again.";
