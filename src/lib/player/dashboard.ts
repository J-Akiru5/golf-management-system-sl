import type { PortalEntry } from "./portal";

/**
 * Which event the player should see at the top of their dashboard, and whether it is today.
 *
 * The club plays in Manila time, so "today" is not the phone's date: a player checking at 11:30 pm
 * in Cebu is on the same day the desk is scoring. Dates come from the entry's playing days, with
 * the older single event date as the fallback for entries saved before days existed.
 */
export type NextUpWhen = "today" | "upcoming" | "past";

export interface NextUp {
  entry: PortalEntry;
  when: NextUpWhen;
  /** The playing day this reading is based on, ISO. */
  date: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in the club's time zone, as an ISO day. */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The days this entry is played, earliest first. Empty when the club has not set a date. */
export function playingDates(entry: PortalEntry): string[] {
  const dated = entry.dates.filter((date) => ISO_DAY.test(date)).sort();
  if (dated.length > 0) return dated;
  return entry.eventDate && ISO_DAY.test(entry.eventDate) ? [entry.eventDate] : [];
}

/**
 * Today's event wins over a later one, and a later one wins over the last event played, so the card
 * at the top is always the round the player cares about now.
 */
export function nextUp(entries: readonly PortalEntry[], today: string): NextUp | null {
  let todayHit: NextUp | null = null;
  let future: NextUp | null = null;
  let past: NextUp | null = null;

  for (const entry of entries) {
    const dates = playingDates(entry);
    if (dates.length === 0) continue;

    if (dates.includes(today)) {
      todayHit ??= { entry, when: "today", date: today };
      continue;
    }

    const soonest = dates.find((date) => date > today);
    if (soonest !== undefined) {
      if (!future || soonest < future.date) future = { entry, when: "upcoming", date: soonest };
      continue;
    }

    const last = dates.at(-1);
    if (last !== undefined && (!past || last > past.date)) {
      past = { entry, when: "past", date: last };
    }
  }

  return todayHit ?? future ?? past;
}
