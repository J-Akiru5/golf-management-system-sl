/**
 * Calendar helpers for the desk's date fields. Pure, so they can be tested without a DOM.
 *
 * Everything is done in UTC on purpose: a date field is a calendar day, not an instant, and local
 * time arithmetic would shift it near midnight or across a daylight-saving change.
 */
import type { Tournament, TournamentDay } from "@/lib/data/types";

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
 * The structured day list a screen should show. A connected desk provides `days` from the
 * `tournament_days` table; the demo, and a connected database before migration 20261035000000,
 * derive the same shape from the dates (and the old tee-time preferences) so the UI has one
 * contract either way.
 */
export function daysOfTournament(t: Tournament): TournamentDay[] {
  if (t.days && t.days.length) return t.days;
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
