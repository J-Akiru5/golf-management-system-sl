/**
 * A calendar file for one tee time, built without a library.
 *
 * The player taps "Add to calendar" on the course; the phone opens the file and adds the event to
 * whichever calendar app it has. Nothing leaves the device, no account is needed, and the file is a
 * data URL so it works offline.
 */

export interface CalendarStart {
  /** The event name, for example "Bamboo Tee". */
  title: string;
  /** ISO playing day, for example "2026-11-12". */
  date: string;
  /** "HH:MM" 24-hour. */
  time: string;
  /** "Hole 10", "Tee 1", or "Iloilo Golf & Country Club". */
  location?: string | null;
  description?: string | null;
  /** How long to block in the calendar. Four hours is a placeholder, not a club rule. */
  durationMinutes?: number;
}

const DEFAULT_MINUTES = 240;

/** RFC 5545 escaping: backslash, semicolon, comma and newlines. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** 2026-11-12 + 06:30 -> 20261112T063000 (local time, paired with the Manila VTIMEZONE). */
function stamp(date: string, time: string): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!day?.[1] || !day[2] || !day[3] || !clock?.[1] || !clock[2]) return null;
  const hours = Number(clock[1]);
  const minutes = Number(clock[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${day[1]}${day[2]}${day[3]}T${pad(hours)}${pad(minutes)}00`;
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const at = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0));
  at.setUTCMinutes(at.getUTCMinutes() + minutes);
  return {
    date: `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`,
    time: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`,
  };
}

/** A stable id, so adding the same start twice replaces it in most calendar apps. */
export function calendarUid(start: CalendarStart): string {
  const safeTitle = start.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return `${start.date.replace(/-/g, "")}-${start.time.replace(":", "")}-${safeTitle || "tee"}@teeline.golf`;
}

/**
 * The .ics text. TZID=Asia/Manila is declared with a fixed +08:00 offset: the Philippines has no
 * daylight saving, so a full VTIMEZONE with transitions would be noise.
 */
export function buildCalendarFile(start: CalendarStart, now: Date = new Date()): string | null {
  const begin = stamp(start.date, start.time);
  if (!begin) return null;
  const duration = start.durationMinutes ?? DEFAULT_MINUTES;
  const endAt = addMinutes(start.date, start.time, duration);
  const end = stamp(endAt.date, endAt.time);
  if (!end) return null;

  const utcNow = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(
    now.getUTCHours(),
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TeeLine Golf//Player start//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Manila",
    "X-LIC-LOCATION:Asia/Manila",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:PHT",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${calendarUid(start)}`,
    `DTSTAMP:${utcNow}`,
    `DTSTART;TZID=Asia/Manila:${begin}`,
    `DTEND;TZID=Asia/Manila:${end}`,
    `SUMMARY:${escapeText(start.title)}`,
  ];
  if (start.location) lines.push(`LOCATION:${escapeText(start.location)}`);
  if (start.description) lines.push(`DESCRIPTION:${escapeText(start.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR", "");
  return lines.join("\r\n");
}

/** A data URL a phone can download without a server round trip. */
export function calendarDataUrl(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export function calendarFileName(start: CalendarStart): string {
  const safe = start.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${safe || "tee-time"}-${start.date}.ics`;
}
