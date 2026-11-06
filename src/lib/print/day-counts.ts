import { type SessionKey, sessionForTime } from "@/lib/data/sessions";

/**
 * Headcounts for the organisers: how many players are on each playing day, split into the morning
 * (AM) and afternoon (PM) sessions, plus the tee-off time each player was given by the draw.
 *
 * Nothing is invented here. The session is the desk's own AM/PM choice for that day; when the desk
 * has not chosen, the player's stored tee time is read back into the session it falls in. A player
 * with neither is counted as "not set", never guessed into a wave.
 */

/** The part of a registration this module reads. Structural, so the desk's own type fits. */
export interface CountEntry {
  entryId: string;
  playerId: string;
  selectedDays?: number[];
  daySessions?: Record<number, SessionKey>;
  dayTee?: Record<number, { teeTime: string | null; startHole: number | null } | undefined>;
}

export interface DayTally {
  am: number;
  pm: number;
  unset: number;
  total: number;
}

export interface DayCountRow {
  entryId: string;
  playerId: string;
  name: string;
  session: SessionKey | null;
  teeTime: string | null;
  startHole: number | null;
}

export interface DayCountBlock {
  dayNumber: number;
  label: string;
  playDate: string | null;
  tally: DayTally;
  rows: DayCountRow[];
}

/** Minutes after midnight for an "HH:MM" time, or null when it is not one. */
function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** The session a player is in on a day: the desk's choice first, then the time they were given. */
export function sessionOfEntry(
  entry: CountEntry,
  dayNumber: number,
  dayIndex: number,
  dayCount: number,
): SessionKey | null {
  const chosen = entry.daySessions?.[dayNumber];
  if (chosen === "AM" || chosen === "PM") return chosen;
  const time = entry.dayTee?.[dayNumber]?.teeTime ?? null;
  if (!time) return null;
  return sessionForTime(time, dayIndex, dayCount)?.key ?? null;
}

/** How many players selected this day, and how they split across AM, PM and undecided. */
export function tallyDay(
  entries: CountEntry[],
  dayNumber: number,
  dayIndex: number,
  dayCount: number,
): DayTally {
  const tally: DayTally = { am: 0, pm: 0, unset: 0, total: 0 };
  for (const entry of entries) {
    if (!(entry.selectedDays ?? []).includes(dayNumber)) continue;
    tally.total += 1;
    const session = sessionOfEntry(entry, dayNumber, dayIndex, dayCount);
    if (session === "AM") tally.am += 1;
    else if (session === "PM") tally.pm += 1;
    else tally.unset += 1;
  }
  return tally;
}

/**
 * One block per playing day: the tally and its players in tee-off order, morning first. Rows sort
 * by the stored tee time, then by name; a player with no time yet sits at the end of their day.
 */
export function buildDayCountBlocks(input: {
  days: { dayNumber: number; label: string; playDate: string | null }[];
  entries: CountEntry[];
  players: { id: string; name: string }[];
}): DayCountBlock[] {
  const nameOf = new Map(input.players.map((player) => [player.id, player.name]));
  const dayCount = input.days.length;
  return input.days.map((day, dayIndex) => {
    const rows = input.entries
      .filter((entry) => (entry.selectedDays ?? []).includes(day.dayNumber))
      .map((entry) => {
        const tee = entry.dayTee?.[day.dayNumber];
        return {
          entryId: entry.entryId,
          playerId: entry.playerId,
          name: nameOf.get(entry.playerId) ?? "Unknown player",
          session: sessionOfEntry(entry, day.dayNumber, dayIndex, dayCount),
          teeTime: tee?.teeTime ?? null,
          startHole: tee?.startHole ?? null,
        };
      })
      .sort(
        (a, b) =>
          (minutesOf(a.teeTime) ?? 24 * 60) - (minutesOf(b.teeTime) ?? 24 * 60) ||
          a.name.localeCompare(b.name),
      );
    return {
      dayNumber: day.dayNumber,
      label: day.label,
      playDate: day.playDate,
      tally: tallyDay(input.entries, day.dayNumber, dayIndex, dayCount),
      rows,
    };
  });
}
