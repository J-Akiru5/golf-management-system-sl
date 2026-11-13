import { tidyName } from "@/lib/names";

/**
 * A player name as the desk and the printed sheets show it: in capitals, like the name written
 * on a scorecard. The stored name keeps its original casing; this only changes the display value.
 */
export function displayName(name: string): string {
  return tidyName(name);
}

/** "07:00" -> "7:00 AM". Clock times in the UI use 12-hour format. */
export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * "2026-11-12" stays a short day people say out loud: "Thu, Nov 12". The day is read in the club's
 * time zone so a date stored at midnight UTC does not flip to the day before.
 */
export function shortDate(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Plus handicaps are stored negative; golfers read them as "+2.3". */
export function fmtIndex(index: number | null): string {
  if (index === null) return "NH";
  return index < 0 ? `+${Math.abs(index).toFixed(1)}` : index.toFixed(1);
}

/** Playing handicap for display. Plus handicaps show as +2, not -2. */
export function fmtHcp(n: number | null): string {
  if (n === null) return "—";
  return n < 0 ? `+${Math.abs(n)}` : String(n);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** A player's photo, only if they agreed to it being kept and used. */
export function photoOf(p: { photo?: string; photoConsent?: boolean }): string | undefined {
  return p.photo && p.photoConsent ? p.photo : undefined;
}
