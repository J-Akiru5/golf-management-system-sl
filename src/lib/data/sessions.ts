/**
 * The tee times a playing day runs on.
 *
 * Every day runs a morning and an afternoon shotgun. Thursday to Saturday the afternoon is 12:30;
 * Sunday's second session is 11:30. A stored tee time always wins, because the club can move a
 * session. These helpers only name the sessions and read a time back into the one it belongs to, so
 * the desk and the sheets can say AM or PM instead of only a clock time.
 */

export const AM_TEE_TIME = "06:30";
export const PM_TEE_TIME = "12:30";
export const FINAL_DAY_PM_TEE_TIME = "11:30";

export type SessionKey = "AM" | "PM";

export interface DaySession {
  key: SessionKey;
  /** What the desk reads: "AM" or "PM". */
  label: string;
  /** HH:MM default for that session on that day. */
  time: string;
  /**
   * Where the time came from. A stored setting wins; a time the code supplied as a fallback is
   * marked as a default so no screen presents it as the club's choice. Day lists built without
   * stored settings leave this out, which reads as the old fixed default.
   */
  source?: "stored" | "default";
}

/**
 * The sessions a day runs when only its position in the list is known. Kept for the screens that
 * still pass an index; the desk's own screens should pass the day itself to `sessionsForDay`, so a
 * stored start and a stored afternoon start are used and a sparse day list cannot move a time.
 */
export function daySessions(dayIndex: number, dayCount: number): DaySession[] {
  const finalDay = dayCount > 0 && dayIndex === dayCount - 1;
  return [
    { key: "AM", label: "AM", time: AM_TEE_TIME },
    { key: "PM", label: "PM", time: finalDay ? FINAL_DAY_PM_TEE_TIME : PM_TEE_TIME },
  ];
}

/** The stored times a playing day carries: its own morning start and its own afternoon start. */
export interface DaySessionSettings {
  /** `tournament_days.start_time`, or null when the day has no start of its own. */
  startTime?: string | null;
  /** `tournament_days.pm_start_time`, or null when the day has no afternoon start of its own. */
  pmStartTime?: string | null;
}

/** The stored fallbacks that apply to the whole event, and whether this is the last playing day. */
export interface SessionDefaults {
  /** `tournaments.pm_first_tee_time`, the club's afternoon start for the event. */
  eventPmStart?: string | null;
  /** The day is the last playing day, by date. Only used when nothing is stored for the afternoon. */
  finalDay?: boolean;
}

/**
 * The morning and afternoon a playing day runs, read from what the desk stored.
 *
 * A stored value always wins: the day's own afternoon start, then the event's afternoon start.
 * The fixed defaults (06:30, 12:30, and 11:30 on the last playing day) apply only when nothing is
 * stored, and each returned session says whether its time is stored or a default. Nothing here
 * looks at a day's position in a list, so day numbers can be sparse.
 */
export function sessionsForDay(
  day: DaySessionSettings = {},
  defaults: SessionDefaults = {},
): DaySession[] {
  const storedAm = clockText(day.startTime ?? null);
  const storedPm = clockText(day.pmStartTime ?? null);
  const eventPm = clockText(defaults.eventPmStart ?? null);
  const morning = storedAm ?? AM_TEE_TIME;
  const afternoon =
    storedPm ?? eventPm ?? (defaults.finalDay ? FINAL_DAY_PM_TEE_TIME : PM_TEE_TIME);
  return [
    { key: "AM", label: "AM", time: morning, source: storedAm ? "stored" : "default" },
    {
      key: "PM",
      label: "PM",
      time: afternoon,
      source: storedPm || eventPm ? "stored" : "default",
    },
  ];
}

/** "AM 06:30 · PM 12:30" for a session list a screen already worked out. */
export function sessionSummaryOf(sessions: readonly DaySession[]): string {
  return sessions.map((session) => `${session.label} ${session.time}`).join(" · ");
}

/** Minutes after midnight for an "HH:MM" time, or null when it is not one. */
function minutesOf(time: string | null): number | null {
  if (!time) return null;
  // Stored tee times come back from Postgres as HH:MM:SS, so the seconds are optional here.
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * The session an assigned tee time belongs to. The afternoon starts at its own default when that is
 * before noon (Sunday's 11:30 start) and at noon otherwise, so 11:59 is still the morning on an
 * ordinary day, 12:00 is the afternoon, and Sunday's 11:45 second-session start is still the afternoon. Null
 * when there is no readable time.
 */
export function sessionForTime(
  time: string | null,
  dayIndex: number,
  dayCount: number,
): DaySession | null {
  return sessionForTimeIn(daySessions(dayIndex, dayCount), time);
}

/**
 * The session a time belongs to, read against a session list a screen already worked out. Same
 * turn-over rule as `sessionForTime`, so a stored day start and a stored afternoon start decide the
 * label instead of the fixed constants.
 */
export function sessionForTimeIn(
  sessions: readonly DaySession[],
  time: string | null,
): DaySession | null {
  const assigned = minutesOf(time);
  if (assigned === null) return null;
  const first = sessions[0];
  if (!first) return null;
  const afternoon = sessions[1] ?? first;
  const afternoonStart = minutesOf(afternoon.time) ?? 12 * 60;
  // Sunday's second session starts before noon, so the turn-over has to move with it.
  const turn = Math.min(12 * 60, afternoonStart);
  return assigned < turn ? first : afternoon;
}

/** "AM 06:30 · PM 12:30" for Thursday to Saturday, "AM 06:30 · PM 11:30" for Sunday. */
export function daySessionSummary(dayIndex: number, dayCount: number): string {
  return sessionSummaryOf(daySessions(dayIndex, dayCount));
}

/** "AM" or "PM" on its own, for a table cell. Null when no time is assigned yet. */
export function sessionLabelForTime(
  time: string | null,
  dayIndex: number,
  dayCount: number,
): string | null {
  return sessionForTime(time, dayIndex, dayCount)?.label ?? null;
}

/** Where a day's AM/PM label came from: the desk's choice, a stored tee time, or the default. */
export type DaySessionSource = "chosen" | "stored" | "default";

/** One registered day's AM/PM indicator, with the time it stands for. */
export interface DaySessionBadge {
  session: SessionKey;
  /** "AM" or "PM", for a table cell. */
  label: string;
  /** "HH:MM" in 24-hour time: the stored time when there is one, otherwise the session default. */
  time: string;
  source: DaySessionSource;
}

/** A stored time as HH:MM, or null when it is not a readable clock time. */
function clockText(time: string | null | undefined): string | null {
  const minutes = minutesOf(time ?? null);
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * The AM/PM indicator for one registered day.
 *
 * The desk's own session wins, because that is the record. Without one, a stored tee time decides
 * the session and supplies the time. A day with neither falls back to the day's morning, so every
 * registered day can say AM or PM; the fallback is a display default, not a stored choice. The last
 * day's afternoon default is 11:30, the rest are 12:30, and the morning is 06:30 throughout.
 */
export function daySessionBadge(input: {
  dayIndex: number;
  dayCount: number;
  session?: SessionKey | null;
  teeTime?: string | null;
  /** A session list already worked out from stored day times. Falls back to the position defaults. */
  sessions?: readonly DaySession[];
}): DaySessionBadge {
  const sessions = input.sessions ?? daySessions(input.dayIndex, input.dayCount);
  const stored = clockText(input.teeTime ?? null);
  const chosen = input.session === "AM" || input.session === "PM" ? input.session : null;
  const morning = sessions[0] ?? { key: "AM" as const, label: "AM", time: AM_TEE_TIME };

  if (chosen) {
    const picked = sessions.find((session) => session.key === chosen) ?? morning;
    // A stored time only answers for the chosen session. If the two disagree, the choice is the
    // record and the day shows the choice's own start time rather than a contradictory label.
    const storedFits = stored !== null && sessionForTimeIn(sessions, stored)?.key === picked.key;
    return {
      session: picked.key,
      label: picked.label,
      time: stored !== null && storedFits ? stored : picked.time,
      source: "chosen",
    };
  }

  if (stored) {
    const resolved = sessionForTimeIn(sessions, stored);
    if (resolved) {
      return { session: resolved.key, label: resolved.label, time: stored, source: "stored" };
    }
  }

  return {
    session: morning.key,
    label: morning.label,
    time: morning.time,
    source: "default",
  };
}

/** The part of a registration this module reads when listing a player's days. */
export interface RegistrationDayFields {
  selectedDays?: number[];
  daySessions?: Record<number, SessionKey>;
  dayTee?: Record<number, { teeTime: string | null } | undefined>;
}

/** One of a player's registered days with its AM/PM indicator. */
export interface RegisteredDayBadge extends DaySessionBadge {
  dayNumber: number;
  dayLabel: string;
}

/**
 * The AM/PM indicator for every day a player is registered for, in day order. A selected day the
 * event does not list is left out rather than guessed. The returned labels are display strings; the
 * stored choice stays on the entry.
 */
export function registeredDayBadges(
  entry: RegistrationDayFields,
  days: readonly { dayNumber: number; label?: string }[],
): RegisteredDayBadge[] {
  const selected = [...new Set(entry.selectedDays ?? [])]
    .filter((dayNumber) => days.some((day) => day.dayNumber === dayNumber))
    .sort((a, b) => a - b);
  return selected.map((dayNumber) => {
    const index = days.findIndex((day) => day.dayNumber === dayNumber);
    const day = days[index];
    const badge = daySessionBadge({
      dayIndex: index,
      dayCount: days.length,
      session: entry.daySessions?.[dayNumber] ?? null,
      teeTime: entry.dayTee?.[dayNumber]?.teeTime ?? null,
    });
    return {
      ...badge,
      dayNumber,
      dayLabel: day?.label?.trim() || `Day ${dayNumber}`,
    };
  });
}
