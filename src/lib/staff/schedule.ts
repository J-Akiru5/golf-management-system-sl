/**
 * The tee sheet's pure rules: which groups belong to a session, which one tees next at the club's
 * clock, and what a search matches. No I/O and no clock read inside, so the schedule's behaviour can
 * be tested for any day and any moment.
 */
import { type SessionKey, sessionForTime } from "@/lib/data/sessions";
import { matchesText } from "@/lib/names";
import type { ScheduleGroup } from "./rows";

export type SessionFilter = SessionKey | "all";

export const SESSION_FILTERS: readonly { key: SessionFilter; label: string; short: string }[] = [
  { key: "all", label: "All day", short: "All" },
  { key: "AM", label: "AM session", short: "AM" },
  { key: "PM", label: "PM session", short: "PM" },
];

export interface SessionCounts {
  am: number;
  pm: number;
  /** Groups whose time is not readable, so no session can be claimed for them. */
  unset: number;
}

/** Minutes after midnight for "HH:MM" or "HH:MM:SS". Null when the text is not a clock time. */
export function minutesOfTime(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** The session a group's tee time belongs to. Null when the time cannot be read. */
export function groupSession(
  time: string | null,
  dayIndex: number,
  dayCount: number,
): SessionKey | null {
  return sessionForTime(time, dayIndex, dayCount)?.key ?? null;
}

export function countGroupSessions(
  groups: readonly { time: string }[],
  dayIndex: number,
  dayCount: number,
): SessionCounts {
  let am = 0;
  let pm = 0;
  let unset = 0;
  for (const group of groups) {
    const key = groupSession(group.time, dayIndex, dayCount);
    if (key === "AM") am += 1;
    else if (key === "PM") pm += 1;
    else unset += 1;
  }
  return { am, pm, unset };
}

/** Keep only the chosen session. A group with no readable time is shown under "All day" only. */
export function filterGroupsBySession<T extends { time: string }>(
  groups: readonly T[],
  filter: SessionFilter,
  dayIndex: number,
  dayCount: number,
): T[] {
  if (filter === "all") return [...groups];
  return groups.filter((group) => groupSession(group.time, dayIndex, dayCount) === filter);
}

/** The club's wall clock, independent of the device's time zone. */
export interface ManilaNow {
  /** ISO date at the club, YYYY-MM-DD. */
  iso: string;
  /** Minutes after midnight at the club. */
  minutes: number;
  /** "HH:MM" 24-hour clock at the club. */
  clock: string;
}

function clubParts(now: Date): { iso: string; clock: string } {
  try {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
    return { iso: date, clock };
  } catch {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return { iso: `${year}-${month}-${day}`, clock };
  }
}

export function manilaNow(now: Date): ManilaNow {
  const { iso, clock } = clubParts(now);
  return { iso, clock, minutes: minutesOfTime(clock) ?? 0 };
}

export type DayState = "before" | "today" | "after";

/** Where the day being viewed sits against the club's clock. */
export function dayState(dayIso: string, now: ManilaNow): DayState {
  if (dayIso > now.iso) return "before";
  if (dayIso < now.iso) return "after";
  return "today";
}

/**
 * The group about to tee off: the first one on a day that has not started, the first one at or
 * after the current minute while the day is running, and none once every group has gone out.
 */
export function nextUpGroup<T extends { time: string }>(
  groups: readonly T[],
  state: DayState,
  nowMinutes: number,
): T | null {
  const timed = groups.filter((group) => minutesOfTime(group.time) !== null);
  if (timed.length === 0) return null;
  if (state === "before") return timed[0] ?? null;
  if (state === "after") return null;
  return timed.find((group) => (minutesOfTime(group.time) ?? 0) >= nowMinutes) ?? null;
}

/**
 * Where "Jump to now" should land. On a day still to come that is the first group, during play it
 * is the next group (or the last one once all have gone out), and after the day it is the last
 * group so the sheet does not scroll back to a tee time that has long passed.
 */
export function jumpTargetGroup<T extends { time: string }>(
  groups: readonly T[],
  state: DayState,
  nowMinutes: number,
): T | null {
  if (groups.length === 0) return null;
  if (state === "before") return groups[0] ?? null;
  if (state === "after") return groups[groups.length - 1] ?? null;
  return nextUpGroup(groups, state, nowMinutes) ?? groups[groups.length - 1] ?? null;
}

/** "now", "in 25 min" or "25 min ago", for the marker beside a tee time. */
export function relativeTalk(time: string, nowMinutes: number): string | null {
  const at = minutesOfTime(time);
  if (at === null) return null;
  const diff = at - nowMinutes;
  if (diff === 0) return "now";
  if (diff > 0) return `in ${diff} min`;
  return `${Math.abs(diff)} min ago`;
}

/** A day's phrase for the current moment, used in the near-empty and marker copy. */
export function dayStateTalk(state: DayState): string {
  if (state === "before") return "Play has not started on this day.";
  if (state === "after") return "Every group has teed off on this day.";
  return "";
}

export interface GroupMatch {
  matched: boolean;
  /** The players whose name matches, so the card can show why it is in the results. */
  playerIds: string[];
}

/**
 * A search across the things a starter says out loud: a group number, a flight, a hole, a clock
 * time, or part of a player's name. An empty search matches everything.
 */
export function matchGroup(
  group: Pick<ScheduleGroup, "number" | "time" | "startHole" | "flightName" | "players">,
  query: string,
): GroupMatch {
  const needle = query.trim().toLowerCase();
  if (needle === "") return { matched: true, playerIds: [] };

  const digits = needle.replace(/\D/g, "");
  const playerIds = group.players
    .filter((player) => matchesText(player.playerName, needle))
    .map((player) => player.playerId);

  const byName = playerIds.length > 0;
  const byNumber = String(group.number).includes(needle) && /^\d{1,3}$/.test(needle);
  const byFlight = group.flightName.toLowerCase().includes(needle);
  const byHole =
    digits !== "" && /^(\d{1,2}|hole)$/i.test(needle) && String(group.startHole) === digits;
  const byTime =
    digits !== "" && /^[\d:]+$/.test(needle) && group.time.replace(/\D/g, "").includes(digits);

  return { matched: byName || byNumber || byFlight || byHole || byTime, playerIds };
}

/** The groups a search keeps, in the order they came in. */
export function filterScheduleByQuery<T extends ScheduleGroup>(
  groups: readonly T[],
  query: string,
): T[] {
  return groups.filter((group) => matchGroup(group, query).matched);
}
