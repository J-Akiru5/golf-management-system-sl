/**
 * Which playing day the staff app is looking at.
 *
 * The staff phone is carried for one day at a time, so every screen takes a day number and the
 * app picks it once: today when the event is on today, otherwise the next day still to come,
 * otherwise the first playing day. A day the event does not play is never offered.
 *
 * Pure on purpose, like `src/lib/routing` and `src/lib/draw`: no clock is read inside, so the
 * choice can be tested for any date.
 */
import type { TournamentDay } from "@/lib/data/types";

export interface StaffDay {
  /** The tournament day number the entry rows use. */
  number: number;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  label: string;
  /** HH:MM the day opens, or null when the club has not set one. */
  startTime: string | null;
}

export function toStaffDays(days: readonly TournamentDay[]): StaffDay[] {
  return days
    .filter((day) => day.isPlayingDay)
    .map((day) => ({
      number: day.dayNumber,
      date: day.playDate,
      label: day.label,
      startTime: day.startTime,
    }))
    .sort((a, b) => a.number - b.number);
}

/** The club's calendar date for a moment, not UTC: a tournament day starts at the club's midnight. */
export function isoToday(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type DayChoiceReason = "today" | "next" | "first" | "none";

export interface DayChoice {
  day: StaffDay | null;
  reason: DayChoiceReason;
}

/**
 * Today if the event plays today; otherwise the soonest day after today; otherwise the first
 * playing day (the event has finished, and the staff app still has to be readable).
 */
export function chooseDay(days: readonly StaffDay[], today: string): DayChoice {
  if (days.length === 0) return { day: null, reason: "none" };
  const exact = days.find((day) => day.date === today);
  if (exact) return { day: exact, reason: "today" };
  const later = days.find((day) => day.date > today);
  if (later) return { day: later, reason: "next" };
  const first = days[0];
  return { day: first ?? null, reason: first ? "first" : "none" };
}

/** "Thu 12 Nov" for the day pill, built from the stored ISO date so no locale can reorder it. */
export function fmtDayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match?.[1] || !match[2] || !match[3]) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-PH", { weekday: "short", day: "numeric", month: "short" });
}

/** What the header says when the day shown is not today. */
export function dayNotice(reason: DayChoiceReason): string | null {
  if (reason === "today") return null;
  if (reason === "next") return "Showing the next playing day.";
  if (reason === "first") return "The event's days have passed. Showing the first playing day.";
  return "This event has no playing days yet.";
}

/** The tournament day number an ISO date belongs to, or null when the event does not play then. */
export function dayNumberForDate(days: readonly StaffDay[], iso: string): number | null {
  return days.find((day) => day.date === iso)?.number ?? null;
}
