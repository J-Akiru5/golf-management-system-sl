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
 * The event's wave start times, from the settings the draw already uses.
 *
 * Wave A is the first tee time; each later wave is one wave gap after the previous one. The tee-time
 * screen offers these as batch choices, so a shotgun day is not typed player by player, and the
 * draw and the schedule cannot disagree about when a wave starts.
 */
export function waveStartTimes(
  firstTeeTime: string,
  waveGapMinutes: number,
  count = 3,
): WaveStart[] {
  const waves = Math.max(1, Math.floor(count));
  const gap = Number.isFinite(waveGapMinutes) ? Math.max(0, Math.floor(waveGapMinutes)) : 0;
  return Array.from({ length: waves }, (_, index) => ({
    wave: waveLetter(index),
    time: addMinutes(firstTeeTime, index * gap),
  }));
}
