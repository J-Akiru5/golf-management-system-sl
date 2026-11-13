import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/format";
import type { Translate } from "@/lib/i18n/t";
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
  /** 1 for a one-day event, and for snapshots written before days. */
  dayNumber: number;
  hole: number | null;
  wave: string | null;
  time: string | null;
}

/** One hole on the player's frozen published card. */
export interface PortalScorecardHole {
  hole: number;
  par: number;
  strokeIndex: number;
  /** Strokes on the hole. 0 when the player picked up: there is no stroke count to show. */
  grossStrokes: number;
  /** True when the player picked up on this hole. It scores no points and has no stroke count. */
  pickedUp?: boolean;
  /** Null when the round had no handicap snapshot. Negative for a plus handicap. */
  handicapStrokes: number | null;
  netStrokes: number | null;
  grossPoints: number;
  netPoints: number | null;
}

/** A daily round's frozen card, as stored in the publication snapshot. */
export interface PortalScorecard {
  /** The player the published card belongs to, when the snapshot names one. */
  playerId?: string | null;
  roundId: string;
  dayNumber: number;
  playDate: string | null;
  state: "provisional" | "final";
  version: number;
  publishedAt: string | null;
  playingHandicap: number | null;
  courseHandicap: number | null;
  grossStrokes: number;
  netStrokes: number | null;
  grossPoints: number;
  netPoints: number | null;
  holesCounted: number;
  holesTotal: number;
  /** Holes the player picked up on. Absent when none. A card with pickups has no stroke total. */
  pickups?: number;
  holes: PortalScorecardHole[];
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
  /** The first start, kept for clients that show one. Equal to `starts[0]`. */
  start: PortalStart | null;
  /** Every published start, one per playing day, ordered by day and start hole. */
  starts: PortalStart[];
  /** The player's own published cards. Empty until the organizer publishes results. */
  scorecards: PortalScorecard[];
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

const asWholeNumber = (value: unknown): number | null => {
  const number = asNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
};

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

/** Sums a complete list; one missing value makes the total unknown, not zero. */
const sumIfComplete = (values: readonly (number | null)[]): number | null =>
  values.some((value) => value === null)
    ? null
    : values.reduce<number>((total, value) => total + (value ?? 0), 0);

function mapScorecardHole(value: unknown): PortalScorecardHole | null {
  const raw = asRecord(value);
  const hole = asWholeNumber(raw.hole);
  const par = asWholeNumber(raw.par);
  const strokeIndex = asWholeNumber(raw.strokeIndex);
  // A pickup has no stroke count by design. It used to be dropped here, so a card with a pickup
  // showed fewer holes than were played. Keep it, marked, with 0 strokes and its points.
  const pickedUp = raw.pickedUp === true;
  const grossStrokes = pickedUp ? 0 : asWholeNumber(raw.grossStrokes);
  const grossPoints = asWholeNumber(raw.grossPoints);

  if (
    hole === null ||
    par === null ||
    strokeIndex === null ||
    grossStrokes === null ||
    grossPoints === null ||
    hole < 1 ||
    par < 1 ||
    strokeIndex < 1 ||
    (!pickedUp && grossStrokes < 1) ||
    grossPoints < 0
  ) {
    return null;
  }

  const handicapStrokes = asWholeNumber(raw.handicapStrokes);
  const netStrokes = asWholeNumber(raw.netStrokes);
  const netPoints = asWholeNumber(raw.netPoints);

  return {
    hole,
    par,
    strokeIndex,
    grossStrokes,
    handicapStrokes,
    netStrokes,
    netPoints: netPoints !== null && netPoints >= 0 ? netPoints : null,
    grossPoints,
    ...(pickedUp ? { pickedUp: true } : {}),
  };
}

export function mapScorecard(value: unknown): PortalScorecard | null {
  const raw = asRecord(value);
  const roundId = asString(raw.roundId);
  if (!roundId) return null;

  const seen = new Set<number>();
  const holes = asArray(raw.holes)
    .map(mapScorecardHole)
    .filter((hole): hole is PortalScorecardHole => hole !== null)
    .filter((hole) => {
      if (seen.has(hole.hole)) return false;
      seen.add(hole.hole);
      return true;
    })
    .sort((a, b) => a.hole - b.hole);

  if (holes.length === 0) return null;

  const rawHolesTotal = asWholeNumber(raw.holesTotal) ?? 0;
  const highestHole = holes[holes.length - 1]?.hole ?? 0;
  const holesTotal = Math.max(1, rawHolesTotal, highestHole);

  const grossStrokes =
    asWholeNumber(raw.grossStrokes) ?? holes.reduce((total, hole) => total + hole.grossStrokes, 0);
  const grossPoints =
    asWholeNumber(raw.grossPoints) ?? holes.reduce((total, hole) => total + hole.grossPoints, 0);
  const netStrokes = hasOwn(raw, "netStrokes")
    ? asWholeNumber(raw.netStrokes)
    : sumIfComplete(holes.map((hole) => hole.netStrokes));
  const netPoints = hasOwn(raw, "netPoints")
    ? asWholeNumber(raw.netPoints)
    : sumIfComplete(holes.map((hole) => hole.netPoints));

  return {
    playerId: asString(raw.playerId),
    roundId,
    dayNumber: asWholeNumber(raw.dayNumber) ?? 1,
    playDate: asString(raw.playDate),
    state: raw.state === "final" ? "final" : "provisional",
    version: asWholeNumber(raw.version) ?? 0,
    publishedAt: asString(raw.publishedAt),
    playingHandicap: asWholeNumber(raw.playingHandicap),
    courseHandicap: asWholeNumber(raw.courseHandicap),
    grossStrokes,
    netStrokes,
    grossPoints,
    netPoints,
    holesCounted: Math.min(asWholeNumber(raw.holesCounted) ?? holes.length, holesTotal),
    holesTotal,
    ...(holes.some((hole) => hole.pickedUp)
      ? { pickups: holes.filter((hole) => hole.pickedUp).length }
      : {}),
    holes,
  };
}

const asStatus = (value: unknown): PortalStatus =>
  value === "ineligible" || value === "needs_review" ? value : "ok";

const asPayment = (value: unknown): PortalPayment =>
  value === "paid" || value === "waived" ? value : "unpaid";

/** One published start. Rows written before days carry no day number and are day 1. */
function mapStart(value: unknown): PortalStart {
  const raw = asRecord(value);
  return {
    dayNumber: asWholeNumber(raw.dayNumber) ?? 1,
    hole: asNumber(raw.hole),
    wave: asString(raw.wave),
    time: asString(raw.time),
  };
}

/** The jsonb the RPC returns, turned into typed values. Never throws; missing keys stay null. */
export function mapPortalState(raw: unknown): PortalState {
  const root = asRecord(raw);
  const player = asRecord(root.player);
  const playerId = asString(player.id);
  const playerName = asString(player.name);

  const entries = asArray(root.entries).map((item): PortalEntry => {
    const entry = asRecord(item);
    const start = asRecord(entry.start);

    // New payloads list every day. Older ones only have the single `start` object.
    const starts = asArray(entry.starts)
      .map(asRecord)
      .filter((value) => Object.keys(value).length > 0)
      .map(mapStart);
    if (starts.length === 0 && Object.keys(start).length > 0) starts.push(mapStart(start));

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
      start: starts[0] ?? null,
      starts,
      scorecards: asArray(entry.scorecards)
        .map(mapScorecard)
        .filter((card): card is PortalScorecard => card !== null),
    };
  });

  return {
    linked: root.linked === true && playerId !== null,
    player: playerId
      ? {
          id: playerId,
          name: playerName ? displayName(playerName) : "Member",
          ngapId: asString(player.ngapId),
        }
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
export function portalErrorMessage(error: unknown, t: Translate): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;

  if (code === "PGRST202" || /could not find the function/i.test(message)) {
    return t("player.error.notReady");
  }
  if (code === "PGRST301" || /jwt|not authenticated/i.test(message)) {
    return t("player.error.session");
  }
  return t("player.error.generic", { message });
}

/* ---------------------------------------------------------------------------------------------- */
/* Wording. Pure, so the page stays a template and the tests pin the words.                        */
/* Every string comes from the dictionary, so the player reads their own language.                 */
/* ---------------------------------------------------------------------------------------------- */

export function statusLabel(t: Translate, status: PortalStatus): string {
  if (status === "ineligible") return t("player.status.ineligible");
  if (status === "needs_review") return t("player.status.needsReview");
  return t("player.status.ok");
}

export function paymentLabel(t: Translate, status: PortalPayment): string {
  if (status === "paid") return t("player.payment.paid");
  if (status === "waived") return t("player.payment.waived");
  return t("player.payment.unpaid");
}

/** "Hole 10A · 7:00 AM", "Tee 1 · 12:00 PM", or why there is no start to show. */
export function startLabel(
  entry: PortalEntry,
  t: Translate,
  formatTime: (hhmm: string) => string,
): string {
  if (!entry.start) {
    return entry.published ? t("player.start.notListed") : t("player.start.notPublished");
  }
  const where =
    entry.startFormat === "shotgun"
      ? t("player.start.hole", { hole: entry.start.hole ?? "?", wave: entry.start.wave ?? "" })
      : t("player.start.tee", { hole: entry.start.hole ?? "?" });
  return entry.start.time ? `${where} · ${formatTime(entry.start.time)}` : where;
}
