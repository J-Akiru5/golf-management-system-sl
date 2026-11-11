/**
 * Which playing day the public tee-time board opens on.
 *
 * A reader who opens the pairings during the event wants today, not day 1: on the second morning
 * the first day is yesterday's board. When today is not a playing day the next day still ahead is
 * the useful one, and once the event is over the first day is the honest fallback because nothing
 * is upcoming any more.
 *
 * Pure, so the choice is tested without a clock: the caller reads "today" in the club's time zone
 * (`manilaToday`) and passes it in as an ISO day.
 */

export interface ProgrammeDay {
  dayNumber: number;
  playDate: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day number to open on: today, else the nearest upcoming day, else the first day.
 * Null only when the programme has no days at all.
 */
export function openingDayNumber(days: readonly ProgrammeDay[], today: string): number | null {
  const first = days[0];
  if (!first) return null;
  // An unreadable "today" cannot answer "is this today", so the board falls back to the first day.
  if (!ISO_DAY.test(today)) return first.dayNumber;

  const dated = days.filter((day) => ISO_DAY.test(day.playDate));
  const exact = dated.find((day) => day.playDate === today);
  if (exact) return exact.dayNumber;

  // The nearest date strictly after today. Comparing ISO days as strings is chronological.
  let next: ProgrammeDay | null = null;
  for (const day of dated) {
    if (day.playDate <= today) continue;
    if (next === null || day.playDate < next.playDate) next = day;
  }
  return (next ?? first).dayNumber;
}
