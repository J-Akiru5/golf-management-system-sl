/**
 * Which playing day the public pairings open on.
 *
 * A reader opening the pairings during the event wants the groups going out now, so the page opens
 * on today in the club's time zone when the published snapshot has a day for it. When today is not
 * in the snapshot (before the event, a rest day, or an old snapshot with no days at all) the first
 * day actually present is the honest fallback: the page never invents a day the published list does
 * not contain, and it never shows tomorrow's groups as if they were today's.
 *
 * Pure, so the choice is tested without a clock: the caller reads "today" in the club's time zone
 * (`manilaToday`) and passes it in as an ISO day.
 */

export interface PairingDayLike {
  dayNumber: number;
  playDate: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day number to open on: today when present, otherwise the first day present. */
export function openingPairingDay(days: readonly PairingDayLike[], today: string): number | null {
  const first = days[0];
  if (!first) return null;
  // An unreadable "today" cannot match a date, so the first published day answers instead.
  if (ISO_DAY.test(today)) {
    const exact = days.find((day) => day.playDate === today);
    if (exact) return exact.dayNumber;
  }
  return first.dayNumber;
}
