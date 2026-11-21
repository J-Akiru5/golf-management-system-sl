/**
 * Date and time formatting for the Admin screens. Pure, and every function takes `now` so a test
 * and the server render the same words. Times are shown in UTC with an explicit zone label on the
 * audit page, so the reader never has to guess.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function valid(iso: string | null): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

export function daysSince(iso: string | null, nowIso: string): number | null {
  const then = valid(iso);
  const now = valid(nowIso);
  if (then === null || now === null) return null;
  return Math.floor((now - then) / DAY);
}

/** "Never", "Just now", "5 minutes ago", "3 hours ago", "12 days ago", "2 months ago". */
export function relativeTime(iso: string | null, nowIso: string): string {
  const then = valid(iso);
  const now = valid(nowIso);
  if (then === null) return "Never";
  if (now === null) return "Unknown";

  const delta = now - then;
  if (delta < MINUTE) return "Just now";
  if (delta < HOUR) {
    const minutes = Math.floor(delta / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (delta < DAY) {
    const hours = Math.floor(delta / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(delta / DAY);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "21 Nov 2026", or "Never". */
export function formatDate(iso: string | null): string {
  const value = valid(iso);
  return value === null ? "Never" : DATE.format(value);
}

/** "21 Nov 2026, 14:05 UTC", or "Never". */
export function formatDateTime(iso: string | null): string {
  const value = valid(iso);
  return value === null ? "Never" : `${DATE_TIME.format(value)} UTC`;
}

/** "IGCC desk, IGCC organizer" or "None". */
export function deskSummary(desk: ReadonlyArray<{ clubName: string; role: string }>): string {
  if (desk.length === 0) return "None";
  return desk.map((entry) => `${entry.clubName} ${entry.role}`).join(", ");
}
