import { daySessions } from "@/lib/data/sessions";
import { addMinutes } from "@/lib/routing/schedule";

export type TeeAssignmentProblem = "both_or_neither" | "hole_range" | "confirmed_needs_both" | null;

/**
 * The tee-time validation shared by the scheduling screen and its tests. The database repeats the
 * same rules in `validate_registration_day` and `assign_registration_day_tee`; this function exists
 * so the operator gets the message before a round trip.
 *
 * A time without a start hole is accepted while the assignment is unconfirmed. That is the shotgun
 * case: a whole start sends every player off at once, so the desk can set one time for the day, and
 * the draw assigns the holes. Confirming still needs both time and hole, which is also the
 * database's check constraint (`not tee_confirmed or (tee_time is not null and start_hole is not
 * null)`). A start hole without a time stays refused: it carries no meaning on its own.
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

export interface StartTime {
  time: string;
}

/**
 * How many start times a field needs: one group on every hole fills a start, and the rest of the
 * field follows one gap later. A field that fits on the holes in one go still gets one start.
 */
export function startCountForField(playerCount: number, holes: number, groupSize: number): number {
  const usableHoles = Number.isFinite(holes) && holes > 0 ? Math.floor(holes) : 18;
  const usableGroup = Number.isFinite(groupSize) && groupSize > 0 ? Math.floor(groupSize) : 1;
  const players = Number.isFinite(playerCount) && playerCount > 0 ? Math.floor(playerCount) : 0;
  return Math.max(1, Math.ceil(players / (usableHoles * usableGroup)));
}

/**
 * Start times counted from the first: the first start is that time and each later one is the gap
 * after the one before it. Nothing is cut to a fixed number: a session gets as many starts as its
 * field needs.
 */
export function startTimesFrom(firstTeeTime: string, gapMinutes: number, count = 1): StartTime[] {
  const wanted = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  const step = Number.isFinite(gapMinutes) ? Math.max(0, Math.floor(gapMinutes)) : 0;
  return Array.from({ length: wanted }, (_, index) => ({
    time: addMinutes(firstTeeTime, index * step),
  }));
}

/**
 * The start times for one playing day. The day's own start time wins when the desk set one, and
 * otherwise the event's first tee time is used.
 */
export function dayStartTimes(
  day: { startTime: string | null },
  firstTeeTime: string,
  gapMinutes: number,
  count = 1,
): StartTime[] {
  const first = day.startTime?.trim() || firstTeeTime;
  return startTimesFrom(first, gapMinutes, count);
}

/**
 * The time a session begins: the day's own start time for the morning, and the club's afternoon
 * time for the afternoon. A day with no session is read as the morning: nothing is guessed beyond
 * that.
 */
export function sessionStartTime(input: {
  session: "AM" | "PM" | null;
  day: { startTime: string | null };
  dayIndex: number;
  dayCount: number;
  firstTeeTime: string;
}): string {
  if (input.session !== "PM") return input.day.startTime?.trim() || input.firstTeeTime;
  return daySessions(input.dayIndex, input.dayCount)[1]?.time ?? "12:30";
}
