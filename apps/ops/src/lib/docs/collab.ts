import type {
  SupabasePersistenceOptions,
  SupabaseProviderOptions,
} from "@supabase-labs/y-supabase";

/**
 * Pure parts of collaboration: the colour a person's cursor and avatar use, the presence list built
 * from awareness state, the words in the status line, and the provider settings SPEC section 6
 * requires. No React and no browser, so all of it is unit tested.
 */

/**
 * Cursor colours. Mid tone, so white label text stays readable on every one and the caret is still
 * visible on both the ivory and the charcoal surface. Fixed order: the palette is part of the look.
 */
export const USER_COLORS = [
  "#2f6b4f",
  "#2c5c94",
  "#8b4436",
  "#6b4a8c",
  "#7d5a0a",
  "#216a70",
  "#8a3a5c",
  "#546b22",
] as const;

/** A stable colour for a user id. The same person keeps the same colour in every session. */
export function userColor(userId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return USER_COLORS[hash % USER_COLORS.length] ?? USER_COLORS[0];
}

export type PresenceUser = {
  clientId: number;
  name: string;
  color: string;
};

/**
 * The people currently in the document, from awareness state. Anything that does not carry a name
 * and a colour is left out rather than shown with a guessed one.
 */
export function presenceUsers(states: ReadonlyMap<number, unknown>): PresenceUser[] {
  const users: PresenceUser[] = [];
  for (const [clientId, state] of states) {
    if (typeof state !== "object" || state === null) continue;
    const user = (state as Record<string, unknown>).user;
    if (typeof user !== "object" || user === null) continue;
    const name = (user as Record<string, unknown>).name;
    const color = (user as Record<string, unknown>).color;
    if (typeof name !== "string" || name.trim().length === 0) continue;
    if (typeof color !== "string" || color.trim().length === 0) continue;
    users.push({ clientId, name: name.trim(), color });
  }
  return users.sort((a, b) => a.clientId - b.clientId);
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export type StatusInput = {
  /** Demo mode: one local document, no provider, nothing shared. */
  demo: boolean;
  online: boolean;
  /** The provider used up its reconnect attempts. */
  gaveUp: boolean;
  status: ConnectionStatus;
  /** A local edit is waiting for the persistence debounce. */
  pending: boolean;
};

/**
 * The status line. Offline and a used-up connection come before the provider's own words, because
 * they are what the person needs to know.
 */
export function describeStatus(input: StatusInput): string {
  if (input.demo) return "Demo, not shared";
  if (!input.online) return "Offline, changes kept";
  if (input.gaveUp) return "Cannot connect";
  if (input.status === "connecting") return "Connecting";
  if (input.status === "disconnected") return "Reconnecting";
  if (input.pending) return "Saving...";
  return "Saved";
}

/** SPEC section 6: a refused private channel must not retry forever. */
export const MAX_RECONNECT_ATTEMPTS = 10;

/** Persistence writes 2 seconds after the last edit, so the "Saving..." line outlives that. */
export const SAVE_SETTLE_MS = 2400;

export const DOC_PERSISTENCE: SupabasePersistenceOptions = {
  table: "ws_doc_states",
  roomColumn: "doc_id",
  stateColumn: "state",
  storeTimeout: 2000,
};

/** Provider options shared by the editor. The awareness instance is passed in by the caller. */
export function docProviderOptions(
  options: Pick<SupabaseProviderOptions, "awareness">,
): SupabaseProviderOptions {
  return {
    awareness: options.awareness,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    persistence: DOC_PERSISTENCE,
  };
}
