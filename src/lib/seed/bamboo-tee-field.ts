import type { DaySessionChoice } from "@/lib/data/day-selection";

/**
 * The club's own field sheet for the 24th Bamboo Tee, as supplied on 4 November 2026.
 *
 * The sheet is a member and a guest per row, each with their own NGAP index and their own schedule
 * written as `DAY 3 AM & DAY 4 AM`. It is read here without guessing: a blank index stays blank, a
 * schedule that names a day but no session is reported, and two partners whose schedules differ are
 * flagged instead of one being picked. Seeding a wrong schedule onto the live event would put a
 * player on the course on the wrong day, so the exceptions are the desk's decision, not ours.
 */

export interface FieldScheduleEntry {
  day: number;
  session: DaySessionChoice;
}

export interface FieldPlayer {
  name: string;
  /** Null when the sheet leaves the cell empty. It is not a zero handicap. */
  index: number | null;
  schedule: FieldScheduleEntry[];
  /** Why the schedule text could not be read in full, or null when it was. */
  scheduleNote: string | null;
}

export interface FieldPair {
  number: number;
  member: FieldPlayer;
  guest: FieldPlayer;
}

export interface WaitingListEntry {
  number: number;
  name: string;
  paid: boolean;
  schedule: FieldScheduleEntry[];
  scheduleNote: string | null;
}

/** Above this a number is not a handicap index, so it is a typo on the sheet rather than a player. */
export const MAX_READABLE_INDEX = 54;

export type FieldIssueKind =
  | "mismatched_schedule"
  | "no_schedule"
  | "single_day"
  | "incomplete_schedule"
  | "missing_index"
  | "index_unreadable";

export interface FieldIssue {
  kind: FieldIssueKind;
  pair: number;
  /** The player the issue belongs to, or null for a pair-level issue. */
  player: "member" | "guest" | null;
  message: string;
}

const DAY_PART = /DAY\s*(\d)\s*(AM|PM)?/gi;

/** `DAY 3 AM & DAY 4 AM` -> `[{ day: 3, session: "AM" }, { day: 4, session: "AM" }]`. */
export function parseSchedule(text: string): {
  schedule: FieldScheduleEntry[];
  note: string | null;
} {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { schedule: [], note: null };
  const schedule: FieldScheduleEntry[] = [];
  let missingSession = false;
  let unreadable = false;
  let matched = 0;
  for (const match of clean.matchAll(DAY_PART)) {
    matched += 1;
    const day = Number(match[1]);
    const session = (match[2] ?? "").toUpperCase();
    if (!Number.isInteger(day) || day < 1) {
      unreadable = true;
      continue;
    }
    if (session !== "AM" && session !== "PM") {
      missingSession = true;
      continue;
    }
    if (!schedule.some((entry) => entry.day === day && entry.session === session)) {
      schedule.push({ day, session });
    }
  }
  if (matched === 0) return { schedule: [], note: `Cannot read the schedule "${clean}".` };
  const notes: string[] = [];
  if (missingSession) notes.push(`"${clean}" names a day without AM or PM.`);
  if (unreadable) notes.push(`"${clean}" has a day number that is not a whole day.`);
  schedule.sort((a, b) => a.day - b.day || a.session.localeCompare(b.session));
  return { schedule, note: notes.length ? notes.join(" ") : null };
}

function parseIndex(text: string): number | null {
  const clean = text.trim();
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

const COLUMNS = [
  "no",
  "member",
  "member_index",
  "member_schedule",
  "guest",
  "guest_index",
  "guest_schedule",
] as const;

const WAITING_COLUMNS = ["no", "name", "payment_note", "schedule"] as const;

function sheetLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Reads the pipe-separated field sheet. Pipes are used because the names contain commas. */
export function parseFieldSheet(text: string): FieldPair[] {
  const lines = sheetLines(text);
  const header = lines.shift();
  if (!header) return [];
  const columns = header.split("|").map((name) => name.trim());
  if (columns.length !== COLUMNS.length || columns.some((name, index) => name !== COLUMNS[index])) {
    throw new Error(`The field sheet header must be: ${COLUMNS.join("|")}`);
  }
  const pairs: FieldPair[] = [];
  for (const line of lines) {
    const cells = line.split("|");
    const number = Number(cells[0]);
    if (!Number.isInteger(number)) continue;
    const memberSchedule = parseSchedule(cells[3] ?? "");
    const guestSchedule = parseSchedule(cells[6] ?? "");
    pairs.push({
      number,
      member: {
        name: (cells[1] ?? "").trim(),
        index: parseIndex(cells[2] ?? ""),
        schedule: memberSchedule.schedule,
        scheduleNote: memberSchedule.note,
      },
      guest: {
        name: (cells[4] ?? "").trim(),
        index: parseIndex(cells[5] ?? ""),
        schedule: guestSchedule.schedule,
        scheduleNote: guestSchedule.note,
      },
    });
  }
  return pairs;
}

/** The block of players on the sheet who have no guest partner. */
export function parseWaitingList(text: string): WaitingListEntry[] {
  const lines = sheetLines(text);
  const header = lines.shift();
  if (!header) return [];
  const columns = header.split("|").map((name) => name.trim());
  if (
    columns.length !== WAITING_COLUMNS.length ||
    columns.some((name, index) => name !== WAITING_COLUMNS[index])
  ) {
    throw new Error(`The waiting-list header must be: ${WAITING_COLUMNS.join("|")}`);
  }
  const entries: WaitingListEntry[] = [];
  for (const line of lines) {
    const cells = line.split("|");
    const number = Number(cells[0]);
    const name = (cells[1] ?? "").trim();
    if (!Number.isInteger(number) || !name) continue;
    const schedule = parseSchedule(cells[3] ?? "");
    entries.push({
      number,
      name,
      paid: (cells[2] ?? "").trim().toUpperCase() === "PAID",
      schedule: schedule.schedule,
      scheduleNote: schedule.note,
    });
  }
  return entries;
}

const sameSchedule = (a: FieldPlayer, b: FieldPlayer) =>
  a.schedule.length === b.schedule.length &&
  a.schedule.every(
    (entry, index) =>
      entry.day === b.schedule[index]?.day && entry.session === b.schedule[index]?.session,
  );

/**
 * Everything in the sheet the desk has to decide before the field is final: partners on different
 * schedules, a day with no session, no schedule at all, a single day, a missing index, or a number
 * that cannot be a handicap index. Each one is named; none is corrected here.
 *
 * An index above the event's limit is not listed: the sheet can legitimately carry 30.5, and the
 * routing engine marks that player ineligible against the tournament setting.
 */
export function fieldIssues(pairs: FieldPair[]): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const pair of pairs) {
    for (const side of ["member", "guest"] as const) {
      const player = pair[side];
      const label = `${pair.number}. ${player.name}`;
      if (player.scheduleNote) {
        issues.push({
          kind: "incomplete_schedule",
          pair: pair.number,
          player: side,
          message: `${label}: ${player.scheduleNote}`,
        });
      }
      if (player.schedule.length === 0) {
        issues.push({
          kind: "no_schedule",
          pair: pair.number,
          player: side,
          message: `${label} has no schedule on the sheet.`,
        });
      } else if (player.schedule.length === 1) {
        issues.push({
          kind: "single_day",
          pair: pair.number,
          player: side,
          message: `${label} is on one playing day only.`,
        });
      }
      if (player.index === null) {
        issues.push({
          kind: "missing_index",
          pair: pair.number,
          player: side,
          message: `${label} has no index on the sheet. It is not zero.`,
        });
      } else if (player.index > MAX_READABLE_INDEX) {
        issues.push({
          kind: "index_unreadable",
          pair: pair.number,
          player: side,
          message: `${label} shows ${player.index}, which is not a handicap index.`,
        });
      }
    }
    if (
      pair.member.schedule.length > 0 &&
      pair.guest.schedule.length > 0 &&
      !sameSchedule(pair.member, pair.guest)
    ) {
      issues.push({
        kind: "mismatched_schedule",
        pair: pair.number,
        player: null,
        message: `${pair.number}. ${pair.member.name} and ${pair.guest.name} are on different schedules.`,
      });
    }
  }
  return issues;
}

export interface FieldSummary {
  pairs: number;
  players: number;
  withSchedule: number;
  mismatched: number;
  missingIndex: number;
  unreadableIndex: number;
  incomplete: number;
  noSchedule: number;
  singleDay: number;
}

export function summariseField(pairs: FieldPair[], issues: FieldIssue[]): FieldSummary {
  const count = (kind: FieldIssueKind) => issues.filter((issue) => issue.kind === kind).length;
  return {
    pairs: pairs.length,
    players: pairs.length * 2,
    withSchedule: pairs.filter(
      (pair) => pair.member.schedule.length > 0 && pair.guest.schedule.length > 0,
    ).length,
    mismatched: count("mismatched_schedule"),
    missingIndex: count("missing_index"),
    unreadableIndex: count("index_unreadable"),
    incomplete: count("incomplete_schedule"),
    noSchedule: count("no_schedule"),
    singleDay: count("single_day"),
  };
}

/** `Day 3 AM, Day 4 AM`, for a screen or a sheet rather than the club's own wording. */
export function describeFieldSchedule(player: FieldPlayer): string {
  if (player.schedule.length === 0) return "No schedule";
  return player.schedule.map((entry) => `Day ${entry.day} ${entry.session}`).join(", ");
}
