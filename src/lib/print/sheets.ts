/**
 * Paper planning for the start sheet: which day and AM/PM session a group belongs to, how the
 * sheets are labelled, and how a long field is split into numbered pages.
 *
 * Everything here is pure. A sheet is A4 paper, so a group never moves to another day or session
 * once it is placed. The final playing day is found from the latest playing date, not from the
 * length of a list that may include a non-playing day.
 */
import { sessionForTime, type SessionKey } from "@/lib/data/sessions";

export interface PrintDay {
  dayNumber: number;
  label?: string | null;
  playDate?: string | null;
}

export interface SheetGroup {
  dayNumber: number;
  time: string;
}

export type SheetSession = SessionKey | "TBD";

export interface PrintSheet<T extends SheetGroup> {
  key: string;
  dayNumber: number;
  dayLabel: string;
  playDate: string | null;
  session: SheetSession;
  /** "Day 2 · Fri 13 Nov · PM". */
  label: string;
  finalDay: boolean;
  groups: T[];
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The first whole number in a label, so D2 sorts before D10. Null when there is none. */
function numberOfLabel(label: string | null | undefined): number | null {
  const match = /(\d+)/.exec(label ?? "");
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Day order by the number in the label, then the stored day number, then the date. This is the
 * order a person reads, so "D2" comes before "D10" and a leading "Day " is irrelevant.
 */
export function comparePrintDays(a: PrintDay, b: PrintDay): number {
  const labelA = numberOfLabel(a.label);
  const labelB = numberOfLabel(b.label);
  const byLabel = (labelA ?? Number.MAX_SAFE_INTEGER) - (labelB ?? Number.MAX_SAFE_INTEGER);
  if (byLabel !== 0) return byLabel;
  const byNumber = a.dayNumber - b.dayNumber;
  if (byNumber !== 0) return byNumber;
  return (a.playDate ?? "").localeCompare(b.playDate ?? "");
}

/** Playing days in reading order, one row per day number. `days` is not mutated. */
export function orderedPrintDays<T extends PrintDay>(days: readonly T[]): T[] {
  const seen = new Set<number>();
  return [...days].sort(comparePrintDays).filter((day) => {
    if (seen.has(day.dayNumber)) return false;
    seen.add(day.dayNumber);
    return true;
  });
}

/** "Day 2", even when the stored label is "D2"; a dash-only or empty label falls back to the number. */
export function displayDayLabel(day: PrintDay): string {
  const stored = day.label?.trim();
  if (!stored) return `Day ${day.dayNumber}`;
  const short = /^d\s*(\d+)$/i.exec(stored);
  if (short?.[1]) return `Day ${short[1]}`;
  return stored;
}

/** "Fri 13 Nov", read in UTC so a calendar date never shifts. */
export function shortPlayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "Day 2 · Fri 13 Nov · PM"; the date is left out when there is none. */
export function sheetLabel(day: PrintDay, session: SheetSession): string {
  const date = shortPlayDate(day.playDate);
  return [displayDayLabel(day), date, session === "TBD" ? "No tee time" : session]
    .filter(Boolean)
    .join(" · ");
}

/** The last playing day is the latest one on the calendar, with the day number breaking a tie. */
export function lastPlayingDayNumber(days: readonly PrintDay[]): number | null {
  const ordered = orderedPrintDays(days);
  let last: PrintDay | null = null;
  for (const day of ordered) {
    if (!last) {
      last = day;
      continue;
    }
    const byDate = (day.playDate ?? "").localeCompare(last.playDate ?? "");
    if (byDate > 0 || (byDate === 0 && day.dayNumber > last.dayNumber)) last = day;
  }
  return last?.dayNumber ?? null;
}

/** True when the day is the final playing day, used for the earlier last-day afternoon default. */
export function isFinalPlayingDay(day: PrintDay, days: readonly PrintDay[]): boolean {
  return lastPlayingDayNumber(days) === day.dayNumber;
}

/**
 * Groups the field into one sheet per day and AM/PM session. Days are read in day order and each
 * day's sessions are AM then PM, so the sheets never mix two days. A group whose time cannot be
 * read is kept on its own day as "No tee time" instead of being guessed into a session.
 */
export function splitIntoSessions<T extends SheetGroup>(
  groups: readonly T[],
  days: readonly PrintDay[],
): PrintSheet<T>[] {
  const ordered = orderedPrintDays(days);
  const indexOf = new Map(ordered.map((day, index) => [day.dayNumber, index]));
  const finalNumber = lastPlayingDayNumber(ordered);
  const sheets: PrintSheet<T>[] = [];

  for (const day of ordered) {
    const dayGroups = groups.filter((group) => group.dayNumber === day.dayNumber);
    if (dayGroups.length === 0) continue;
    const dayIndex = indexOf.get(day.dayNumber) ?? -1;
    const buckets = new Map<SheetSession, T[]>();

    for (const group of dayGroups) {
      const resolved =
        dayIndex >= 0 ? (sessionForTime(group.time, dayIndex, ordered.length)?.key ?? "TBD") : "TBD";
      const bucket = buckets.get(resolved);
      if (bucket) bucket.push(group);
      else buckets.set(resolved, [group]);
    }

    const order: SheetSession[] = ["AM", "PM", "TBD"];
    for (const session of order) {
      const sessionGroups = buckets.get(session);
      if (!sessionGroups || sessionGroups.length === 0) continue;
      sheets.push({
        key: `${day.dayNumber}:${session}`,
        dayNumber: day.dayNumber,
        dayLabel: displayDayLabel(day),
        playDate: day.playDate ?? null,
        session,
        label: sheetLabel(day, session),
        finalDay: day.dayNumber === finalNumber,
        groups: sessionGroups,
      });
    }
  }

  return sheets;
}

/** Splits items into fixed-size pages, keeping order. Never mutates the input. */
export function paginate<T>(items: readonly T[], perPage: number): T[][] {
  if (!Number.isFinite(perPage) || perPage < 1) return items.length ? [[...items]] : [];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }
  return pages;
}

/** "Page 1 of 3". */
export function pageLabel(page: number, total: number): string {
  return `Page ${page} of ${Math.max(total, 1)}`;
}

/**
 * The footer stamp. A printed sheet can always be checked against the live list because the
 * version and the time it was published are on the paper. A draft says so instead.
 */
export function versionLine(
  published: { version?: number; at?: string } | null | undefined,
): string {
  if (!published?.at) return "Not published · working draft";
  const when = new Date(published.at);
  if (Number.isNaN(when.getTime())) return "Published copy · date not readable";
  const stamp = new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(when);
  return published.version
    ? `Published version ${published.version} · ${stamp}`
    : `Published ${stamp}`;
}

export interface HoleGridCell<T> {
  slot: "A" | "B";
  group: T;
}

export interface HoleGridRow<T> {
  hole: number;
  cells: HoleGridCell<T>[];
}

/**
 * The landscape shotgun grid: holes in order, with up to two groups per hole (A then B). A third
 * group on the same hole is still listed, so the starter can see the conflict rather than losing a
 * group from the paper.
 */
export function holeGridRows<T extends { startHole: number; number: number; time: string }>(
  groups: readonly T[],
  holeCount = 18,
): HoleGridRow<T>[] {
  const byHole = new Map<number, T[]>();
  for (const group of groups) {
    const list = byHole.get(group.startHole);
    if (list) list.push(group);
    else byHole.set(group.startHole, [group]);
  }

  return Array.from({ length: holeCount }, (_, index) => {
    const hole = index + 1;
    const list = (byHole.get(hole) ?? [])
      .slice()
      .sort((a, b) => a.time.localeCompare(b.time) || a.number - b.number);
    return {
      hole,
      cells: list.map((group, position) => ({
        slot: (position === 0 ? "A" : "B") as "A" | "B",
        group,
      })),
    };
  }).filter((row) => row.cells.length > 0);
}

/** Splits the field into reading-order columns for the two-column notice-board poster. */
export function posterColumns<T>(groups: readonly T[], columns = 2): T[][] {
  const count = Math.max(1, Math.floor(columns));
  const size = Math.ceil(groups.length / count);
  if (size === 0) return [];
  return paginate(groups, size);
}

/** The label the desk and staff screens print above the format, e.g. "Shotgun start · 6:30 AM". */
export function formatLine(startFormat: "shotgun" | "two_tee", firstTeeTime: string): string {
  const kind = startFormat === "shotgun" ? "Shotgun start" : "Two-tee start";
  return firstTeeTime ? `${kind} · first tee ${firstTeeTime}` : kind;
}
