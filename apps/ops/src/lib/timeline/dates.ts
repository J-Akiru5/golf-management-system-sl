/**
 * Day-key helpers for the Timeline page.
 *
 * Everything is a `YYYY-MM-DD` string read as UTC midnight, built from the parsed parts, so the
 * server render and the browser render produce the same label on every machine. Nothing here reads
 * the clock: the caller passes `today` in, exactly like the rest of the workspace.
 */

const DAY_MS = 86_400_000;

export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTHS_SHORT = [
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

/** Monday first, matching the calendar grid. */
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAYS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real `YYYY-MM-DD` day as UTC midnight, or null. `2026-02-31` is not a day. */
export function parseDay(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = DAY_PATTERN.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isDay(value: unknown): value is string {
  return parseDay(value) !== null;
}

/** The day key for a UTC date. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A date or timestamp as the day it falls on, or null. Used for `created_at` values. */
export function dayFromTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  return isDay(day) ? day : null;
}

/** Whole days moved, across month and year boundaries. */
export function addDays(day: string, days: number): string {
  const date = parseDay(day);
  if (date === null) throw new Error(`Not a day: ${day}`);
  return dayKey(new Date(date.getTime() + days * DAY_MS));
}

/** `to` minus `from`, in whole days. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const start = parseDay(from);
  const end = parseDay(to);
  if (start === null) throw new Error(`Not a day: ${from}`);
  if (end === null) throw new Error(`Not a day: ${to}`);
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/** Monday of the week that holds the day. */
export function startOfWeek(day: string): string {
  const date = parseDay(day);
  if (date === null) throw new Error(`Not a day: ${day}`);
  const offset = (date.getUTCDay() + 6) % 7;
  return dayKey(new Date(date.getTime() - offset * DAY_MS));
}

export function endOfWeek(day: string): string {
  return addDays(startOfWeek(day), 6);
}

export function startOfMonth(day: string): string {
  const date = parseDay(day);
  if (date === null) throw new Error(`Not a day: ${day}`);
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: string): string {
  const date = parseDay(day);
  if (date === null) throw new Error(`Not a day: ${day}`);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return dayKey(last);
}

export function isSameMonth(left: string, right: string): boolean {
  return left.slice(0, 7) === right.slice(0, 7);
}

/** 0 for Monday through 6 for Sunday. */
export function weekdayIndex(day: string): number {
  const date = parseDay(day);
  if (date === null) throw new Error(`Not a day: ${day}`);
  return (date.getUTCDay() + 6) % 7;
}

/** Every day from `from` to `to`, inclusive. Empty when `from` is after `to`. */
export function eachDay(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const days: string[] = [];
  for (let index = 0; index <= span; index += 1) days.push(addDays(from, index));
  return days;
}

/** The seven days of the week that holds `day`, Monday first. */
export function weekDays(day: string): string[] {
  return eachDay(startOfWeek(day), endOfWeek(day));
}

/**
 * The six rows a month grid needs, Monday first. Always 42 days: the days before the first of the
 * month and after the last belong to the neighbouring months and are drawn dimmed.
 */
export function monthGrid(day: string): string[] {
  const first = startOfMonth(day);
  const gridStart = startOfWeek(first);
  const days: string[] = [];
  for (let index = 0; index < 42; index += 1) days.push(addDays(gridStart, index));
  return days;
}

/** "12 Jan 2027" */
export function formatDay(day: string): string {
  const date = parseDay(day);
  if (date === null) return day;
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

/** "January 2027" */
export function formatMonthYear(day: string): string {
  const date = parseDay(day);
  if (date === null) return day;
  return `${MONTHS_LONG[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

/** "Wednesday, 12 November 2026" */
export function formatDayLong(day: string): string {
  const date = parseDay(day);
  if (date === null) return day;
  return `${WEEKDAYS_LONG[weekdayIndex(day)] ?? ""}, ${date.getUTCDate()} ${
    MONTHS_LONG[date.getUTCMonth()] ?? ""
  } ${date.getUTCFullYear()}`;
}

/** The dates an item covers, in plain words: one day, or "12 to 14 Dec 2026". */
export function formatDayRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  if (from.slice(0, 7) === to.slice(0, 7)) {
    const start = parseDay(from);
    if (start === null) return `${formatDay(from)} to ${formatDay(to)}`;
    return `${start.getUTCDate()} to ${formatDay(to)}`;
  }
  return `${formatDay(from)} to ${formatDay(to)}`;
}

/** Inclusive overlap of two day ranges. */
export function rangesOverlap(
  a: { from: string; to: string },
  b: { from: string; to: string },
): boolean {
  return a.from <= b.to && b.from <= a.to;
}
