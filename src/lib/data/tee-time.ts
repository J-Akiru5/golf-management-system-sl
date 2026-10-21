export type TeeAssignmentProblem = "both_or_neither" | "hole_range" | "confirmed_needs_both" | null;

/**
 * The tee-time validation shared by the scheduling screen and its tests. The database repeats the
 * same rules in `validate_registration_day` and `assign_registration_day_tee`; this function exists
 * so the operator gets the message before a round trip.
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
  if (hasTime !== hasHole) return "both_or_neither";
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
