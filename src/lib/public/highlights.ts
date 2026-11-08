/**
 * The public face of an event: what a signed-out visitor may see.
 *
 * Everything here is pure and every date is arithmetic on the ISO string, deliberately. The landing
 * page is server rendered and then hydrated, so anything that reads the clock or the browser's locale
 * at render time produces different output on the two passes and React reports a hydration mismatch.
 * "Today" is therefore passed in from the server rather than looked up here.
 */

/** One event, as `public_open_events()` returns it. No player data, no contact details. */
export interface PublicEvent {
  tournamentId: string;
  name: string;
  dates: string[];
  startFormat: string;
  /** "06:30" */
  firstTeeTime: string;
  /** "2026-11-01" */
  cutOffDate: string;
  /** Confirmed entries only. */
  entered: number;
  /**
   * True while the club still takes entries. An event stays visible after its entries close, so the
   * landing page can show the tournament during the week it is played; this flag is what stops the
   * page offering an entry link that no longer works.
   */
  entriesOpen: boolean;
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

/** The parts of an ISO date, without constructing a Date and inheriting a timezone. */
function parts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  return { y: Number(y), m: Number(m), d: Number(d) };
}

/** Whole days from one ISO date to another. Negative when `to` is in the past. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = parts(fromIso);
  const b = parts(toIso);
  if (!a || !b) return 0;
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000);
}

/**
 * "Nov 12–15, 2026" for days in one month, "Nov 30 – Dec 2, 2026" across two, "Nov 12, 2026" for one.
 * An en dash spaces the range; the project's own writing uses that form.
 */
export function dateRange(dates: readonly string[]): string {
  const clean = dates.map(parts).filter((p): p is NonNullable<typeof p> => p !== null);
  if (clean.length === 0) return "Dates to be confirmed";

  const first = clean[0] as { y: number; m: number; d: number };
  const last = clean.at(-1) as { y: number; m: number; d: number };
  const startMonth = MONTHS[first.m - 1];
  const endMonth = MONTHS[last.m - 1];
  if (!startMonth || !endMonth) return "Dates to be confirmed";

  if (clean.length === 1 || (first.y === last.y && first.m === last.m && first.d === last.d)) {
    return `${startMonth} ${first.d}, ${first.y}`;
  }
  if (first.y === last.y && first.m === last.m) {
    return `${startMonth} ${first.d}–${last.d}, ${first.y}`;
  }
  if (first.y === last.y) {
    return `${startMonth} ${first.d} – ${endMonth} ${last.d}, ${first.y}`;
  }
  return `${startMonth} ${first.d}, ${first.y} – ${endMonth} ${last.d}, ${last.y}`;
}

/** "4 days" or "1 day". Used as a quiet label beside the range. */
export function dayCount(dates: readonly string[]): string {
  const n = dates.length;
  if (n <= 1) return "1 day";
  return `${n} days`;
}

/** "6:30 AM" from "06:30" or "06:30:00". */
export function timeLabel(t: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!match) return t;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${suffix}`;
}

/**
 * Where the event is played, shown on the public pages in place of the start time. Every event is
 * at the one club for now, and the public page already names the club in its footer, so this is a
 * constant rather than a field the event would need a database change to carry.
 */
export const VENUE_LABEL = "Iloilo Golf and Country Club";

/** "Shotgun · 6:30 AM". The format words are the ones the desk uses, not new ones. */
export function formatLabel(startFormat: string, firstTeeTime: string): string {
  const format = startFormat === "two_tee" ? "Two-tee" : "Shotgun";
  return `${format} · ${timeLabel(firstTeeTime)}`;
}

/**
 * How the cut-off reads. `days` is days from today to the cut-off date, counted on the date itself,
 * so the last day reads "Closes today" rather than "0 days".
 */
export function cutOffLabel(days: number): string {
  if (days < 0) return "Entry closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "1 day to enter";
  return `${days} days to enter`;
}

/** Whether the cut-off is close enough to be worth emphasis. */
export function cutOffIsUrgent(days: number): boolean {
  return days >= 0 && days <= 3;
}

/** "12 entered" / "1 entered" / "No entries yet". */
export function enteredLabel(entered: number): string {
  if (entered <= 0) return "No entries yet";
  return `${entered} entered`;
}

/**
 * The next slide, wrapping in both directions. Pure so the carousel's arithmetic is covered by a
 * test rather than discovered by clicking.
 */
export function nextIndex(current: number, count: number, step: number): number {
  if (count <= 0) return 0;
  return (((current + step) % count) + count) % count;
}
