import { type SessionKey, sessionForTime } from "@/lib/data/sessions";

/**
 * Headcounts for the organisers: how many players are on each playing day, split into the morning
 * (AM) and afternoon (PM) sessions, plus the tee-off time and start hole the draw gave each player.
 *
 * Nothing is invented here. The session is the desk's own AM/PM choice for that day; when the desk
 * has not chosen, a stored tee time or the start time the draw gave the group is read back into the
 * session it falls in. A player with neither is counted as "not set", never guessed into a session.
 */

/** The part of a registration this module reads. Structural, so the desk's own type fits. */
export interface CountEntry {
  entryId: string;
  playerId: string;
  selectedDays?: number[];
  daySessions?: Record<number, SessionKey>;
  dayTee?: Record<number, { teeTime: string | null; startHole: number | null } | undefined>;
}

/** Where the draw put one player on one day: the group's time and hole. */
export interface DrawPlacement {
  time: string | null;
  startHole: number | null;
}

/** One playing day's board, as the print center loaded it. */
export interface DrawBoard {
  day: number;
  groups: {
    time: string;
    startHole: number;
    players: { id: string }[];
  }[];
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
  // Postgres returns `time` as HH:MM:SS, so the seconds are optional here.
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * The session a player is in on a day: the desk's choice first, then the time they were given by
 * the desk or by the draw.
 */
export function sessionOfEntry(
  entry: CountEntry,
  dayNumber: number,
  dayIndex: number,
  dayCount: number,
  drawOf?: (playerId: string) => DrawPlacement | null,
): SessionKey | null {
  const chosen = entry.daySessions?.[dayNumber];
  if (chosen === "AM" || chosen === "PM") return chosen;
  const draw = drawOf?.(entry.playerId) ?? null;
  const time = entry.dayTee?.[dayNumber]?.teeTime ?? draw?.time ?? null;
  if (!time) return null;
  return sessionForTime(time, dayIndex, dayCount)?.key ?? null;
}

/** How many players selected this day, and how they split across AM, PM and undecided. */
export function tallyDay(
  entries: CountEntry[],
  dayNumber: number,
  dayIndex: number,
  dayCount: number,
  drawOf?: (playerId: string) => DrawPlacement | null,
): DayTally {
  const tally: DayTally = { am: 0, pm: 0, unset: 0, total: 0 };
  for (const entry of entries) {
    if (!(entry.selectedDays ?? []).includes(dayNumber)) continue;
    tally.total += 1;
    const session = sessionOfEntry(entry, dayNumber, dayIndex, dayCount, drawOf);
    if (session === "AM") tally.am += 1;
    else if (session === "PM") tally.pm += 1;
    else tally.unset += 1;
  }
  return tally;
}

/** Each player's placement on each day, keyed `day:player`. Null when the draw has no group for them. */
function placementsOf(boards: DrawBoard[] | null): Map<string, DrawPlacement> {
  const placements = new Map<string, DrawPlacement>();
  for (const board of boards ?? []) {
    for (const group of board.groups) {
      for (const player of group.players) {
        placements.set(`${board.day}:${player.id}`, {
          time: group.time || null,
          startHole: group.startHole,
        });
      }
    }
  }
  return placements;
}

/**
 * One block per playing day: the tally and its players in tee-off order, morning first. The time and
 * hole come from the player's pairing; a stored per-day time wins when the desk saved one. Rows with
 * no time yet sit at the end of their day.
 */
export function buildDayCountBlocks(input: {
  days: { dayNumber: number; label: string; playDate: string | null }[];
  entries: CountEntry[];
  players: { id: string; name: string }[];
  boards?: DrawBoard[] | null;
}): DayCountBlock[] {
  const nameOf = new Map(input.players.map((player) => [player.id, player.name]));
  const placements = placementsOf(input.boards ?? null);
  const dayCount = input.days.length;
  return input.days.map((day, dayIndex) => {
    const drawOf = (playerId: string) => placements.get(`${day.dayNumber}:${playerId}`) ?? null;
    const rows = input.entries
      .filter((entry) => (entry.selectedDays ?? []).includes(day.dayNumber))
      .map((entry) => {
        const tee = entry.dayTee?.[day.dayNumber];
        const draw = drawOf(entry.playerId);
        return {
          entryId: entry.entryId,
          playerId: entry.playerId,
          name: nameOf.get(entry.playerId) ?? "Unknown player",
          session: sessionOfEntry(entry, day.dayNumber, dayIndex, dayCount, drawOf),
          teeTime: tee?.teeTime ?? draw?.time ?? null,
          startHole: tee?.startHole ?? draw?.startHole ?? null,
        };
      })
      .sort(
        (a, b) =>
          (minutesOf(a.teeTime) ?? 24 * 60) - (minutesOf(b.teeTime) ?? 24 * 60) ||
          a.name.localeCompare(b.name),
      );
    // The tally is read off the same rows the sheet prints, so the summary can never disagree
    // with the list under it.
    const tally: DayTally = {
      am: rows.filter((row) => row.session === "AM").length,
      pm: rows.filter((row) => row.session === "PM").length,
      unset: rows.filter((row) => row.session === null).length,
      total: rows.length,
    };
    return {
      dayNumber: day.dayNumber,
      label: day.label,
      playDate: day.playDate,
      tally,
      rows,
    };
  });
}

/** One group on a day's board, with the players the draw put in it. */
export interface GroupBoardGroup {
  number: number;
  startHole: number;
  time: string;
  flight: string;
  players: { id: string; name: string }[];
}

export interface GroupRow {
  key: string;
  number: number;
  time: string | null;
  startHole: number | null;
  session: SessionKey | null;
  flight: string;
  players: { id: string; name: string }[];
}

export interface DayGroupBlock {
  dayNumber: number;
  label: string;
  playDate: string | null;
  groups: GroupRow[];
}

/**
 * The same day split by the draw's groups instead of by session: one row per tee-off group, in tee
 * order, with the players who go off together. Used by the organisers' "by group" view and sheet.
 */
export function buildGroupBlocks(input: {
  days: { dayNumber: number; label: string; playDate: string | null }[];
  boards?: { day: number; groups: GroupBoardGroup[] }[] | null;
}): DayGroupBlock[] {
  const byDay = new Map((input.boards ?? []).map((board) => [board.day, board.groups]));
  const dayCount = input.days.length;
  return input.days.map((day, dayIndex) => ({
    dayNumber: day.dayNumber,
    label: day.label,
    playDate: day.playDate,
    groups: [...(byDay.get(day.dayNumber) ?? [])]
      .map((group) => {
        // Postgres returns `time` as HH:MM:SS; the sheet reads HH:MM.
        const time = group.time ? group.time.slice(0, 5) : null;
        return {
          key: `${group.number}-${group.startHole}`,
          number: group.number,
          time,
          startHole: group.startHole,
          session: time ? (sessionForTime(time, dayIndex, dayCount)?.key ?? null) : null,
          flight: group.flight,
          players: group.players,
        };
      })
      .sort(
        (a, b) =>
          (minutesOf(a.time) ?? 24 * 60) - (minutesOf(b.time) ?? 24 * 60) ||
          (a.startHole ?? 0) - (b.startHole ?? 0) ||
          a.number - b.number,
      ),
  }));
}
