import { daySessions } from "@/lib/data/sessions";
import { addMinutes, waveLetter } from "@/lib/routing/schedule";

export type TeeAssignmentProblem = "both_or_neither" | "hole_range" | "confirmed_needs_both" | null;

/**
 * The tee-time validation shared by the scheduling screen and its tests. The database repeats the
 * same rules in `validate_registration_day` and `assign_registration_day_tee`; this function exists
 * so the operator gets the message before a round trip.
 *
 * A time without a start hole is accepted while the assignment is unconfirmed. That is the shotgun
 * case: a wave sends every player off at once, so the desk can set one time for the day, and the
 * draw assigns the holes. Confirming still needs both time and hole, which is also the database's
 * check constraint (`not tee_confirmed or (tee_time is not null and start_hole is not null)`).
 * A start hole without a time stays refused: it carries no meaning on its own.
 */
export function teeAssignmentProblem(input: {
  teeTime: string | null;
  startHole: number | null;
  confirmed: boolean;
  courseHoles: number;
}): TeeAssignmentProblem {
  const hasTime = Boolean(input.teeTime);
  const hasHole = input.startHole !== null;
  if (!hasTime && !hasHole) return input.confirmed ? "confirmed_needs_both" : null;
  if (!hasTime) return "both_or_neither";
  if (!hasHole) return input.confirmed ? "confirmed_needs_both" : null;
  if (
    input.startHole !== null &&
    (!Number.isInteger(input.startHole) ||
      input.startHole < 1 ||
      input.startHole > input.courseHoles)
  ) {
    return "hole_range";
  }
  return null;
}

export interface WaveStart {
  wave: string;
  time: string;
}

/**
 * A day runs two shotgun waves and no more: A in the morning, B in the afternoon. The club's own
 * rule, not a capacity calculation, so nothing in the desk offers a Wave C onwards.
 */
export const MAX_WAVES = 2;

/** A wave letter as its 1-based position: A is 1, B is 2. Null for anything else. */
export function wavePosition(wave: string | null | undefined): number | null {
  const normalised = (wave ?? "").trim().toUpperCase();
  if (!/^[A-Z]$/.test(normalised)) return null;
  return normalised.charCodeAt(0) - 64;
}

/**
 * Why a wave is refused, or null when it is usable. A wave is one letter, A onwards; the desk types
 * it in a list, so the only mistake left is a value that did not come from that list.
 */
export function waveProblem(wave: string | null): "wave_format" | null {
  if (wave === null) return null;
  return /^[A-Z]$/.test(wave.trim().toUpperCase()) ? null : "wave_format";
}

/**
 * How many waves a field plays: one group on every hole fills a wave, and a day never asks for more
 * than the club's two waves, A and B. A smaller field still gets one wave, so the answer is 1 or 2.
 */
export function waveCountForField(playerCount: number, holes: number, groupSize: number): number {
  const usableHoles = Number.isFinite(holes) && holes > 0 ? Math.floor(holes) : 18;
  const usableGroup = Number.isFinite(groupSize) && groupSize > 0 ? Math.floor(groupSize) : 1;
  const players = Number.isFinite(playerCount) && playerCount > 0 ? Math.floor(playerCount) : 0;
  return Math.min(MAX_WAVES, Math.max(1, Math.ceil(players / (usableHoles * usableGroup))));
}

/**
 * The wave start times for one playing day.
 *
 * A wave is an interval, not a session: Wave A starts at the day's own start time when one is set,
 * otherwise at the event's first tee time, and each later wave starts the event's interval after the
 * one before it. Nothing is read back from the session clock, so a 15-minute interval gives A 06:30
 * and B 06:45 on every day alike.
 *
 * A count above two is cut to two: this club plays Wave A and Wave B, never a third.
 */
export function dayWaveStartTimes(
  day: { startTime: string | null },
  firstTeeTime: string,
  intervalMinutes: number,
  count = MAX_WAVES,
): WaveStart[] {
  const first = day.startTime?.trim() || firstTeeTime;
  return waveStartTimes(first, intervalMinutes, count);
}

/**
 * The tee time a player plays on one day: the day's session start, moved one interval for each wave
 * after the first.
 *
 * Wave A plays at the session's own start, so a 15-minute interval puts a wave B player 15 minutes
 * later. The morning starts at the day's own start time when the desk set one, and otherwise at the
 * event's first tee time; the afternoon is the club's afternoon time, which is 11:30 on the last day
 * and 12:30 on every other day. A player with no wave plays at the session start, and a day with no
 * session is read as the morning: nothing is guessed beyond that.
 */
export function sessionWaveTime(input: {
  session: "AM" | "PM" | null;
  wave: string | null;
  day: { startTime: string | null };
  dayIndex: number;
  dayCount: number;
  firstTeeTime: string;
  intervalMinutes: number;
}): string {
  const morning = input.day.startTime?.trim() || input.firstTeeTime;
  const afternoon = daySessions(input.dayIndex, input.dayCount)[1]?.time ?? "12:30";
  const base = input.session === "PM" ? afternoon : morning;
  const step = Number.isFinite(input.intervalMinutes)
    ? Math.max(0, Math.floor(input.intervalMinutes))
    : 0;
  const position = wavePosition(input.wave);
  const offset = position === null ? 0 : Math.max(0, position - 1) * step;
  return addMinutes(base, offset);
}

/**
 * Wave starts counted from the first time: A at that time, each later wave one interval after the
 * one before it. The count is cut to the club's two waves, so no caller can ask for a Wave C.
 */
export function waveStartTimes(
  firstTeeTime: string,
  intervalMinutes: number,
  count = MAX_WAVES,
): WaveStart[] {
  const wanted = Number.isFinite(count) ? Math.floor(count) : MAX_WAVES;
  const waves = Math.min(MAX_WAVES, Math.max(1, wanted));
  const step = Number.isFinite(intervalMinutes) ? Math.max(0, Math.floor(intervalMinutes)) : 0;
  return Array.from({ length: waves }, (_, index) => ({
    wave: waveLetter(index),
    time: addMinutes(firstTeeTime, index * step),
  }));
}
