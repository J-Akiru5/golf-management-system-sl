/**
 * The rows the staff app draws: one per player for a day, with the group they walk with, the
 * tee-off they should expect and whether they have arrived.
 *
 * Everything is derived from what the desk already holds. Nothing is invented:
 *   - a day the player did not select is not on the list;
 *   - a player without a group is kept, and shown as not placed;
 *   - the session comes from the desk's own AM/PM choice, then the draw's wave label, then the
 *     assigned tee time, and is null when none of those exist.
 */
import { type SessionKey, sessionForTime } from "@/lib/data/sessions";
import type { RegistrationEntry } from "@/lib/data/types";

/** A group's address in the staff app. The day is in the id so a shared phone's link is complete. */
export function staffGroupId(dayNumber: number, groupNumber: number): string {
  return `g-${dayNumber}-${groupNumber}`;
}

export function parseStaffGroupId(id: string): { dayNumber: number; groupNumber: number } | null {
  const match = /^g-(\d{1,2})-(\d{1,3})$/.exec(id);
  if (!match?.[1] || !match[2]) return null;
  const dayNumber = Number(match[1]);
  const groupNumber = Number(match[2]);
  if (!Number.isInteger(dayNumber) || !Number.isInteger(groupNumber)) return null;
  return { dayNumber, groupNumber };
}

export interface StaffGroup {
  id: string;
  number: number;
  wave: string | null;
  /** "HH:MM" as stored. */
  time: string;
  startHole: number;
  flightId: string;
  players: { playerId: string; playerName: string }[];
}

export interface StaffPerson {
  playerId: string;
  playerName: string;
  contactNumber: string | null;
}

export interface StaffRow {
  entryId: string;
  playerId: string;
  name: string;
  phone: string | null;
  group: StaffGroup | null;
  flightId: string | null;
  teeTime: string | null;
  startHole: number | null;
  session: SessionKey | null;
  arrived: boolean;
  arrivedAt: string | null;
  arrivedBy: string | null;
  needsReview: boolean;
}

export interface BuildRowsInput {
  entries: readonly RegistrationEntry[];
  people: ReadonlyMap<string, StaffPerson>;
  groups: readonly StaffGroup[];
  /** The tournament day number. */
  dayNumber: number;
  /** The day's 0-based position and the event's day count, for the session cut. */
  dayIndex: number;
  dayCount: number;
}

const minutesOf = (time: string | null): number | null => {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match?.[1] || !match[2]) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

/** The wave label carries the session when the draw was made with named shotguns (D3-AM-A). */
function sessionOfWave(wave: string | null): SessionKey | null {
  if (!wave) return null;
  const match = /(?:^|[-_])(AM|PM)(?:[-_]|$)/.exec(wave.toUpperCase());
  return match?.[1] === "AM" ? "AM" : match?.[1] === "PM" ? "PM" : null;
}

export function buildRows(input: BuildRowsInput): StaffRow[] {
  const groupByPlayer = new Map<string, StaffGroup>();
  for (const group of input.groups) {
    for (const player of group.players) groupByPlayer.set(player.playerId, group);
  }

  const rows: StaffRow[] = [];
  for (const entry of input.entries) {
    if (!(entry.selectedDays ?? []).includes(input.dayNumber)) continue;
    const person = input.people.get(entry.playerId);
    const name = person?.playerName ?? "Unknown player";
    const group = groupByPlayer.get(entry.playerId) ?? null;
    const stored = entry.dayTee?.[input.dayNumber] ?? null;
    const teeTime = stored?.teeTime ?? group?.time ?? null;
    const startHole = stored?.startHole ?? group?.startHole ?? null;
    const chosen = entry.daySessions?.[input.dayNumber] ?? null;
    const session =
      chosen ??
      sessionOfWave(group?.wave ?? null) ??
      sessionForTime(teeTime, input.dayIndex, input.dayCount)?.key ??
      null;
    const checkIn = entry.dayCheckIn?.[input.dayNumber] ?? null;
    rows.push({
      entryId: entry.id,
      playerId: entry.playerId,
      name,
      phone: person?.contactNumber ?? null,
      group,
      flightId: group?.flightId ?? entry.flightId ?? null,
      teeTime,
      startHole,
      session,
      arrived: Boolean(checkIn?.at),
      arrivedAt: checkIn?.at ?? null,
      arrivedBy: checkIn?.byName ?? null,
      needsReview: entry.status === "needs_review",
    });
  }

  // Tee order first, then start hole, then the name. A player with no tee time goes to the end:
  // "not placed" is a fact the desk must see, not something to sort into the middle.
  return rows.sort((a, b) => {
    const at = minutesOf(a.teeTime);
    const bt = minutesOf(b.teeTime);
    if (at === null && bt !== null) return 1;
    if (bt === null && at !== null) return -1;
    if (at !== null && bt !== null && at !== bt) return at - bt;
    const ah = a.startHole ?? 99;
    const bh = b.startHole ?? 99;
    if (ah !== bh) return ah - bh;
    return a.name.localeCompare(b.name);
  });
}

export interface ArrivalSummary {
  total: number;
  arrived: number;
  notArrived: number;
  needsReview: number;
  unplaced: number;
}

export function summarise(rows: readonly StaffRow[]): ArrivalSummary {
  let arrived = 0;
  let needsReview = 0;
  let unplaced = 0;
  for (const row of rows) {
    if (row.arrived) arrived += 1;
    if (row.needsReview) needsReview += 1;
    if (!row.group) unplaced += 1;
  }
  return {
    total: rows.length,
    arrived,
    notArrived: rows.length - arrived,
    needsReview,
    unplaced,
  };
}

export type ArrivalFilter = "all" | "not-arrived" | "arrived" | "needs-review";

export const FILTER_LABELS: Record<ArrivalFilter, string> = {
  all: "All",
  "not-arrived": "Not arrived",
  arrived: "Arrived",
  "needs-review": "Needs review",
};

/** A name or phone search. Case and spacing are ignored, and a phone matches its digits. */
export function matchesQuery(row: StaffRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  if (row.name.toLowerCase().includes(needle)) return true;
  const digits = needle.replace(/\D/g, "");
  if (digits.length >= 3 && (row.phone ?? "").replace(/\D/g, "").includes(digits)) return true;
  return String(row.group?.number ?? "").includes(needle) && /^\d{1,3}$/.test(needle);
}

export function filterRows(
  rows: readonly StaffRow[],
  filter: ArrivalFilter,
  query = "",
): StaffRow[] {
  return rows.filter((row) => {
    if (!matchesQuery(row, query)) return false;
    if (filter === "arrived") return row.arrived;
    if (filter === "not-arrived") return !row.arrived;
    if (filter === "needs-review") return row.needsReview;
    return true;
  });
}

export function rowsInGroup(rows: readonly StaffRow[], groupId: string): StaffRow[] {
  return rows.filter((row) => row.group?.id === groupId);
}

export interface ScheduleGroup extends StaffGroup {
  flightName: string;
  arrived: number;
}

/** Groups in tee order with how many of their players have arrived. */
export function buildSchedule(
  groups: readonly StaffGroup[],
  rows: readonly StaffRow[],
  flightName: (id: string | null) => string,
): ScheduleGroup[] {
  const arrivedByEntryGroup = new Map<string, number>();
  for (const row of rows) {
    if (!row.group || !row.arrived) continue;
    arrivedByEntryGroup.set(row.group.id, (arrivedByEntryGroup.get(row.group.id) ?? 0) + 1);
  }
  return groups
    .map((group) => ({
      ...group,
      flightName: flightName(group.flightId),
      arrived: arrivedByEntryGroup.get(group.id) ?? 0,
    }))
    .sort((a, b) => {
      const at = minutesOf(a.time);
      const bt = minutesOf(b.time);
      if (at !== null && bt !== null && at !== bt) return at - bt;
      if (a.startHole !== b.startHole) return a.startHole - b.startHole;
      return a.number - b.number;
    });
}

/** The players on a day who the draw has not placed yet. */
export function unplacedRows(rows: readonly StaffRow[]): StaffRow[] {
  return rows.filter((row) => row.group === null);
}
