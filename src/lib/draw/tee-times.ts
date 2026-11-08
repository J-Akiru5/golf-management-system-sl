/**
 * Where the draw put a player: the time their group starts, the hole it starts on, the group
 * number, and the batch/session a stored label names. A group is described by its time and hole;
 * a session may have more than one start time, and the time is the fact the desk and the tee-times
 * screen both use.
 */
import { type DaySession, type SessionKey, sessionForTimeIn } from "@/lib/data/sessions";

export interface DrawPlacement {
  time: string;
  startHole: number;
  groupNumber: number;
  /**
   * The batch letter a stored label names ("A" in "D1-AM-A"), or absent when the group has no
   * label. The database accepts one letter, never the whole label.
   */
  batch?: string;
  /** The session a stored label names, or absent when there is none. */
  session?: SessionKey;
}

/** A group as the tee-times screen reads it. Only the draw's own facts are used. */
export interface DrawGroupPlacement {
  time: string;
  startHole: number;
  number: number;
  playerIds: string[];
  /** A stored label from an older board, e.g. "D1-AM-A". A draw made today leaves it null. */
  wave?: string | null;
  /** The playing day, when the board carries one. */
  dayNumber?: number | null;
}

/** What a stored label says. Every part is optional: a label may name only some of them. */
export interface BatchLabel {
  dayNumber: number | null;
  session: SessionKey | null;
  batch: string | null;
}

/**
 * Reads a stored batch label such as "D1-AM-A" without guessing.
 *
 * "D3-AM-B" names day 3, the morning and batch B. "AM-B" names the session and batch. "A" is a
 * batch letter on its own. A label that names no batch letter returns null for `batch`, so a
 * caller never writes half a label into `registration_days.wave`.
 */
export function parseBatchLabel(label: string | null | undefined): BatchLabel {
  const parts = (label ?? "")
    .trim()
    .toUpperCase()
    .split(/[\s:_-]+/)
    .filter(Boolean);
  let dayNumber: number | null = null;
  let session: SessionKey | null = null;
  let batch: string | null = null;
  for (const part of parts) {
    const day = /^D(\d+)$/.exec(part);
    if (day?.[1]) {
      const parsed = Number(day[1]);
      if (Number.isInteger(parsed) && parsed > 0) dayNumber = parsed;
      continue;
    }
    if (part === "AM" || part === "PM") {
      session = part;
      continue;
    }
    if (/^[A-Z]$/.test(part)) batch = part;
  }
  return { dayNumber, session, batch };
}

/**
 * The start time, hole and number each player takes from the draw, keyed by player id.
 *
 * With a playing day, only that day's groups are read: a group whose label or stored day number
 * names another day gives nothing. That is what stops a Day 1 group's hole being written to Day 3.
 * A group with no day information is accepted, because the loaded board is already that day's
 * board on a desk that reads one round at a time.
 *
 * A player the board lists twice keeps the first group's placement. The draw flags the duplicate
 * separately, so this never hides it.
 */
export function placementsFromDraw(
  draw: readonly DrawGroupPlacement[],
  dayNumber: number | null = null,
): Map<string, DrawPlacement> {
  const out = new Map<string, DrawPlacement>();
  for (const group of draw) {
    const label = parseBatchLabel(group.wave);
    const namedDay = typeof group.dayNumber === "number" ? group.dayNumber : label.dayNumber;
    if (dayNumber !== null && namedDay !== null && namedDay !== dayNumber) continue;
    for (const playerId of group.playerIds) {
      if (out.has(playerId)) continue;
      out.set(playerId, {
        time: group.time,
        startHole: group.startHole,
        groupNumber: group.number,
        ...(label.batch ? { batch: label.batch } : {}),
        ...(label.session ? { session: label.session } : {}),
      });
    }
  }
  return out;
}

/**
 * The session a row belongs to, in the order the desk trusts the facts: the session the desk
 * recorded for that day, then the session a stored draw label names, then the time itself. Null
 * when none of them says anything.
 */
export function sessionForRow(input: {
  chosen?: SessionKey | null;
  placement?: SessionKey | null;
  time: string | null;
  sessions: readonly DaySession[];
}): SessionKey | null {
  if (input.chosen) return input.chosen;
  if (input.placement) return input.placement;
  return sessionForTimeIn(input.sessions, input.time)?.key ?? null;
}

/**
 * The batch letters a field needs, in order: A, B, C and so on. Enough letters are offered for
 * any field, so a day that needs a third start is never shown only two.
 */
export function batchLetters(count: number): string[] {
  const wanted = Number.isFinite(count) ? Math.min(26, Math.max(0, Math.floor(count))) : 0;
  return Array.from({ length: wanted }, (_, index) => String.fromCharCode(65 + index));
}
