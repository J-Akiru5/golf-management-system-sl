import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * The player portal's data access, and the pure mapping from the database's jsonb to typed values.
 *
 * Everything comes from two SECURITY DEFINER functions (`current_player_id`,
 * `player_portal_entries`) that return the signed-in player's own entry only. The portal never
 * reads a club table directly: players are not club members, and `is_club_member()` gates every
 * staff table.
 */

export type PortalStatus = "ok" | "ineligible" | "needs_review";
export type PortalPayment = "unpaid" | "paid" | "waived";
export type PortalStartFormat = "shotgun" | "two_tee";

export interface PortalStart {
  hole: number | null;
  wave: string | null;
  time: string | null;
}

export interface PortalEntry {
  tournamentId: string;
  eventName: string;
  eventDate: string | null;
  dates: string[];
  startFormat: PortalStartFormat;
  firstTeeTime: string;
  state: string;
  status: PortalStatus;
  reasons: string[];
  frozenIndex: number | null;
  playingHandicap: number | null;
  category: string | null;
  tee: string | null;
  flight: string | null;
  paymentStatus: PortalPayment;
  published: boolean;
  start: PortalStart | null;
}

export interface PortalPlayer {
  id: string;
  name: string;
  ngapId: string | null;
}

export interface PortalState {
  linked: boolean;
  player: PortalPlayer | null;
  entries: PortalEntry[];
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

const asBoolean = (value: unknown): boolean => value === true;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asStatus = (value: unknown): PortalStatus =>
  value === "ineligible" || value === "needs_review" ? value : "ok";

const asPayment = (value: unknown): PortalPayment =>
  value === "paid" || value === "waived" ? value : "unpaid";

/** The jsonb the RPC returns, turned into typed values. Never throws; missing keys stay null. */
export function mapPortalState(raw: unknown): PortalState {
  const root = asRecord(raw);
  const player = asRecord(root.player);
  const playerId = asString(player.id);

  const entries = asArray(root.entries).map((item): PortalEntry => {
    const entry = asRecord(item);
    const start = asRecord(entry.start);
    const hasStart = Object.keys(start).length > 0;

    return {
      tournamentId: asString(entry.tournamentId) ?? "",
      eventName: asString(entry.eventName) ?? "Untitled event",
      eventDate: asString(entry.eventDate),
      dates: asArray(entry.dates)
        .map((date) => asString(date))
        .filter((date): date is string => date !== null),
      startFormat: entry.startFormat === "two_tee" ? "two_tee" : "shotgun",
      firstTeeTime: asString(entry.firstTeeTime) ?? "",
      state: asString(entry.state) ?? "draft",
      status: asStatus(entry.status),
      reasons: asArray(entry.reasons)
        .map((reason) => asString(reason))
        .filter((reason): reason is string => reason !== null),
      frozenIndex: asNumber(entry.frozenIndex),
      playingHandicap: asNumber(entry.playingHandicap),
      category: asString(entry.category),
      tee: asString(entry.tee),
      flight: asString(entry.flight),
      paymentStatus: asPayment(entry.paymentStatus),
      published: asBoolean(entry.published),
      start: hasStart
        ? {
            hole: asNumber(start.hole),
            wave: asString(start.wave),
            time: asString(start.time),
          }
        : null,
    };
  });

  return {
    linked: root.linked === true && playerId !== null,
    player: playerId
      ? { id: playerId, name: asString(player.name) ?? "Member", ngapId: asString(player.ngapId) }
      : null,
    entries,
  };
}

/** The signed-in account's player id, or null when the account is not linked yet. */
export async function currentPlayerId(client: SupabaseClient<Database>): Promise<string | null> {
  const { data, error } = await client.rpc("current_player_id");
  if (error) throw error;
  return typeof data === "string" && data !== "" ? data : null;
}

export async function loadPortal(client: SupabaseClient<Database>): Promise<PortalState> {
  const { data, error } = await client.rpc("player_portal_entries");
  if (error) throw error;
  return mapPortalState(data);
}

/**
 * The database has not had this migration yet. PostgREST answers with PGRST202 when a function is
 * missing from its schema cache; anything else is a real failure and is shown as one.
 */
export function portalErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;

  if (code === "PGRST202" || /could not find the function/i.test(message)) {
    return "The player area is not switched on for this project yet. The club has to apply the player portal migration first.";
  }
  if (code === "PGRST301" || /jwt|not authenticated/i.test(message)) {
    return "Your session has ended. Sign in again to see your entry.";
  }
  return `The player area could not load: ${message}`;
}

/* ---------------------------------------------------------------------------------------------- */
/* Wording. Pure, so the page stays a template and the tests pin the words.                        */
/* ---------------------------------------------------------------------------------------------- */

export function statusLabel(status: PortalStatus): string {
  if (status === "ineligible") return "Cannot be placed in a group";
  if (status === "needs_review") return "Entry received, being checked by the club";
  return "Entered";
}

export function paymentLabel(status: PortalPayment): string {
  if (status === "paid") return "Recorded as paid";
  if (status === "waived") return "Waived";
  return "Not recorded yet";
}

/** "Hole 10A · 7:00 AM", "Tee 1 · 12:00 PM", or why there is no start to show. */
export function startLabel(entry: PortalEntry, formatTime: (hhmm: string) => string): string {
  if (!entry.start) {
    return entry.published
      ? "Your group is not on the published list. Ask the club."
      : "Pairings are not out yet.";
  }
  const where =
    entry.startFormat === "shotgun"
      ? `Hole ${entry.start.hole ?? "?"}${entry.start.wave ?? ""}`
      : `Tee ${entry.start.hole ?? "?"}`;
  return entry.start.time ? `${where} · ${formatTime(entry.start.time)}` : where;
}
