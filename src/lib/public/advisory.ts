import { manilaToday } from "@/lib/player/dashboard";

/**
 * The organizer's advisory for one event, as `public_advisory()` returns it.
 *
 * The database already allow-lists the five keys and hides the surface when the desk holds it, but
 * the browser must still decide two things for itself: whether `show` is true, and whether the
 * advisory has expired. "Today" is the club's calendar day, not the visitor's, so a reader in another
 * time zone sees the same advisory as the desk in Iloilo.
 *
 * Pure, so the expiry rule is tested without a clock. `advisoryForToday` is the one convenience that
 * reads the clock; the pages call it on the server, which avoids a hydration mismatch between the
 * server render and the browser's first paint.
 */

export interface PublicAdvisory {
  show: boolean;
  title: string;
  lines: string[];
  /** Empty when the organizer left it out; the banner then shows no signature line. */
  signature: string;
  /** The last day the advisory is shown, as an ISO day in the club's time zone. */
  until: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const trimmed = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Validate the JSON document before it reaches a component. Anything unreadable returns null, which
 * the pages treat exactly like "no advisory": nothing is shown rather than a broken panel. A missing
 * `until` is a refusal, not an endless advisory, because an expired notice is worse than none.
 */
export function parsePublicAdvisory(value: unknown): PublicAdvisory | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  if (typeof record.show !== "boolean") return null;

  const title = trimmed(record.title);
  const until = trimmed(record.until);
  if (title === "" || !ISO_DAY.test(until)) return null;

  const lines = Array.isArray(record.lines)
    ? record.lines.map(trimmed).filter((line) => line !== "")
    : [];

  return {
    show: record.show,
    title,
    lines,
    signature: trimmed(record.signature),
    until,
  };
}

/** The advisory to render on `today`, or null. Both dates are ISO days in the club's time zone. */
export function visibleAdvisory(
  advisory: PublicAdvisory | null | undefined,
  today: string,
): PublicAdvisory | null {
  if (!advisory || !advisory.show) return null;
  if (!ISO_DAY.test(today) || !ISO_DAY.test(advisory.until)) return null;
  return today <= advisory.until ? advisory : null;
}

/** The advisory to render now, read against the club's calendar day in Asia/Manila. */
export function advisoryForToday(
  advisory: PublicAdvisory | null | undefined,
  now: Date = new Date(),
): PublicAdvisory | null {
  return visibleAdvisory(advisory, manilaToday(now));
}
