import { daySessionBadge, type SessionKey, sessionForTime } from "@/lib/data/sessions";
import type { PortalEntry } from "./portal";

/**
 * What the player's home needs to say about one playing day.
 *
 * The club publishes one draw snapshot at a time, so only one playing day carries the confirmed
 * start. The other days are shown with their date and say plainly that their start is not out yet.
 * That is honest; repeating one time across every day would be a guess. The day the snapshot
 * belongs to is the day being played now, or the next one to be played, or the last one played.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface TeeDay {
  date: string;
  /** 1-based within the event, matching the club's Day 1, Day 2. */
  dayNumber: number;
  /** "Thu, Nov 12" in Philippine English. */
  label: string;
  isToday: boolean;
  /** True for the one day the published snapshot belongs to. */
  hasStart: boolean;
  session: SessionKey | null;
  /** "HH:MM" 24-hour. */
  time: string | null;
  hole: number | null;
  flight: string | null;
}

/** The days this entry is played, earliest first. Empty when the club set no date. */
export function entryDates(entry: Pick<PortalEntry, "dates" | "eventDate">): string[] {
  const dated = entry.dates.filter((date) => ISO_DAY.test(date)).sort();
  if (dated.length > 0) return dated;
  return entry.eventDate && ISO_DAY.test(entry.eventDate) ? [entry.eventDate] : [];
}

/** "Thu, Nov 12". Manila has no daylight saving, so noon UTC+8 is safely inside the date. */
export function dayLabel(iso: string): string {
  const parsed = new Date(`${iso}T12:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

/**
 * Which playing day the published snapshot belongs to. Today wins, then the next day, then the
 * last day played. -1 when the event has no playing days.
 */
export function publishedDayIndex(dates: readonly string[], today: string): number {
  if (dates.length === 0) return -1;
  const todayIndex = dates.indexOf(today);
  if (todayIndex >= 0) return todayIndex;
  const nextIndex = dates.findIndex((date) => date > today);
  if (nextIndex >= 0) return nextIndex;
  return dates.length - 1;
}

/** One chip per playing day, with the published start on the day it belongs to. */
export function teeDays(
  entry: Pick<PortalEntry, "dates" | "eventDate" | "start" | "startFormat" | "flight"> & {
    starts?: PortalEntry["starts"];
  },
  today: string,
): TeeDay[] {
  const dates = entryDates(entry);
  const startIndex = publishedDayIndex(dates, today);
  // A snapshot written with days carries one start per playing day, so each chip shows its own.
  // An older snapshot has only the single start, which belongs to the published day.
  const perDay = entry.starts && entry.starts.length > 0 ? entry.starts : null;

  return dates.map((date, index) => {
    const own = perDay
      ? (perDay.find((start) => start.dayNumber === index + 1) ?? null)
      : index === startIndex
        ? entry.start
        : null;
    const hasStart = own !== null;
    const startTime = own?.time ?? null;
    const session = hasStart
      ? (daySessionBadge({
          dayIndex: index,
          dayCount: dates.length,
          teeTime: startTime,
        }).session ?? null)
      : null;
    return {
      date,
      dayNumber: index + 1,
      label: dayLabel(date),
      isToday: date === today,
      hasStart,
      session,
      time: hasStart ? startTime : null,
      hole: hasStart ? (own?.hole ?? null) : null,
      flight: hasStart ? (entry.flight ?? null) : null,
    };
  });
}

/** The day the page opens on: today if the event is being played, otherwise the published day. */
export function defaultDayIndex(days: readonly TeeDay[], today: string): number {
  const todayIndex = days.findIndex((day) => day.isToday);
  if (todayIndex >= 0) return todayIndex;
  const withStart = days.findIndex((day) => day.hasStart);
  return withStart >= 0 ? withStart : 0;
}

/** The start as a real instant in the club's time zone, or null when either part is missing. */
export function manilaStartIso(date: string, time: string | null): string | null {
  if (!ISO_DAY.test(date) || !time) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const hh = String(hours).padStart(2, "0");
  return `${date}T${hh}:${match[2]}:00+08:00`;
}

export type TeeCountdown =
  | { kind: "before"; ms: number }
  | { kind: "starting" }
  | { kind: "after" };

/**
 * Time left before the tee time. It is deliberately client-side: a server-rendered minute count
 * would be wrong the moment the page is cached. "starting" is the last minute; at the tee time the
 * countdown stops and the page moves on to the next step.
 */
export function teeCountdown(startIso: string | null, now: Date): TeeCountdown | null {
  if (!startIso) return null;
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  const ms = start - now.getTime();
  if (ms <= 0) return { kind: "after" };
  if (ms <= 60_000) return { kind: "starting" };
  return { kind: "before", ms };
}

/** "1h 20m", "45m", "2d 3h". Rounds up to the minute so "0m" only appears at the tee. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

/** The session of a stored time, for a label beside the clock. */
export function sessionOf(
  time: string | null,
  dayIndex: number,
  dayCount: number,
): SessionKey | null {
  return sessionForTime(time, dayIndex, dayCount)?.key ?? null;
}
