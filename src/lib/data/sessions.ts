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
}

/**
 * The sessions a day runs: a morning and an afternoon, every day. `dayIndex` is 0-based, the same
 * order the day list uses, and only the last day's afternoon time differs from the rest.
 */
export function daySessions(dayIndex: number, dayCount: number): DaySession[] {
  const finalDay = dayCount > 0 && dayIndex === dayCount - 1;
  return [
    { key: "AM", label: "AM", time: AM_TEE_TIME },
    { key: "PM", label: "PM", time: finalDay ? FINAL_DAY_PM_TEE_TIME : PM_TEE_TIME },
  ];
}

/** Minutes after midnight for an "HH:MM" time, or null when it is not one. */
function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * The session an assigned tee time belongs to: the day's nearest default. A 06:10 shot is still the
 * morning and a 12:40 start is still the afternoon, which a fixed midday cut would get wrong once
 * the club moves a session. Null when there is no readable time.
 */
export function sessionForTime(
  time: string | null,
  dayIndex: number,
  dayCount: number,
): DaySession | null {
  const assigned = minutesOf(time);
  const sessions = daySessions(dayIndex, dayCount);
  const first = sessions[0];
  if (!first || assigned === null) return null;
  let best = first;
  let bestGap = Math.abs((minutesOf(first.time) ?? 0) - assigned);
  for (const session of sessions.slice(1)) {
    const gap = Math.abs((minutesOf(session.time) ?? 0) - assigned);
    if (gap < bestGap) {
      best = session;
      bestGap = gap;
    }
  }
  return best;
}

/** "AM 06:30 · PM 12:30" for Thursday to Saturday, "AM 06:30 · PM 11:30" for Sunday. */
export function daySessionSummary(dayIndex: number, dayCount: number): string {
  return daySessions(dayIndex, dayCount)
    .map((session) => `${session.label} ${session.time}`)
    .join(" · ");
}

/** "AM" or "PM" on its own, for a table cell. Null when no time is assigned yet. */
export function sessionLabelForTime(
  time: string | null,
  dayIndex: number,
  dayCount: number,
): string | null {
  return sessionForTime(time, dayIndex, dayCount)?.label ?? null;
}
