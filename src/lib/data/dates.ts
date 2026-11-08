/**
 * Calendar helpers for the desk's date fields. Pure, so they can be tested without a DOM.
 *
 * Everything is done in UTC on purpose: a date field is a calendar day, not an instant, and local
 * time arithmetic would shift it near midnight or across a daylight-saving change.
 */
import type { RegistrationEntry, Tournament, TournamentDay } from "@/lib/data/types";

/** Adds whole days to an ISO date (YYYY-MM-DD). An unreadable date is returned unchanged. */
export function addIsoDays(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return iso;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * The day after the last day on file, which is what "Add a day" means. It falls back to the event
 * date when the list is empty, and to tomorrow when even that is missing or unreadable, so the
 * button can never clone a date.
 */
export function nextPlayDay(dates: string[], fallback: string): string {
  const last = dates.at(-1) ?? fallback;
  const next = addIsoDays(last, 1);
  return next === last ? addIsoDays(new Date().toISOString().slice(0, 10), 1) : next;
}

/**
 * Stored days in day order, with one row per day number. The order is what names a day's session,
 * so an unsorted or sparse list must not put Sunday's afternoon on the wrong date. The date breaks
 * a tie between two rows that claim the same number.
 */
function orderedDays(days: readonly TournamentDay[]): TournamentDay[] {
  const seen = new Set<number>();
  return [...days]
    .sort((a, b) => a.dayNumber - b.dayNumber || a.playDate.localeCompare(b.playDate))
    .filter((day) => {
      if (seen.has(day.dayNumber)) return false;
      seen.add(day.dayNumber);
      return true;
    });
}

/**
 * The playing days a screen should show, in day order, with one row per day number. A trailing
 * non-playing day would otherwise count towards the number of days and make the last playing day's
 * afternoon read as an ordinary day.
 */
export function playingDaysOf(days: readonly TournamentDay[]): TournamentDay[] {
  return orderedDays(days.filter((day) => day.isPlayingDay));
}

/**
 * The last playing day is the latest one on the calendar, with the day number breaking a tie. A
 * list that ends with a non-playing day or carries its rows in an odd order still names the real
 * final day, so the earlier final-day afternoon default lands on the right date.
 */
export function lastPlayingDayNumber(days: readonly TournamentDay[]): number | null {
  let last: TournamentDay | null = null;
  for (const day of playingDaysOf(days)) {
    if (!last) {
      last = day;
      continue;
    }
    const byDate = day.playDate.localeCompare(last.playDate);
    if (byDate > 0 || (byDate === 0 && day.dayNumber > last.dayNumber)) last = day;
  }
  return last?.dayNumber ?? null;
}

/** True when the day is the last playing day of the event, by date rather than by list position. */
export function isFinalPlayingDay(
  day: Pick<TournamentDay, "dayNumber">,
  days: readonly TournamentDay[],
): boolean {
  return lastPlayingDayNumber(days) === day.dayNumber;
}

/**
 * The structured day list a screen should show. A connected desk provides `days` from the
 * `tournament_days` table; the demo, and a connected database before migration 20261037000000,
 * derive the same shape from the dates (and the old tee-time preferences) so the UI has one
 * contract either way.
 */
export function daysOfTournament(t: Tournament): TournamentDay[] {
  if (t.days && t.days.length) return orderedDays(t.days);
  const preferences = t.registration.teeTimes ?? [];
  const byDate = new Map(preferences.map((d) => [d.date, d]));
  const dates = (t.dates.length ? t.dates : [t.config.date]).filter(Boolean);
  return dates.map((date, index) => {
    const preference = byDate.get(date);
    return {
      id: `${t.id}-day-${index + 1}`,
      dayNumber: index + 1,
      playDate: date,
      label: preference?.label || `Day ${index + 1}`,
      startTime: index === 0 ? t.config.firstTeeTime : null,
      isPlayingDay: true,
    };
  });
}

/**
 * The days an entry selected, from the old teePreferences keys, for a demo entry or a database that
 * predates registration_days. A null preference means the player did not choose that day.
 */
export function selectedDaysOf(
  entry: Pick<RegistrationEntry, "teePreferences" | "selectedDays">,
  days: TournamentDay[],
): number[] {
  if (entry.selectedDays) return entry.selectedDays;
  const derived = Object.entries(entry.teePreferences)
    .filter(([, value]) => Boolean(value))
    .map(([date]) => days.find((day) => day.playDate === date)?.dayNumber)
    .filter((day): day is number => typeof day === "number");
  return [...new Set(derived)].sort((a, b) => a - b);
}
