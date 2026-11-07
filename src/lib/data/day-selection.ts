export type DaySelectionProblem = "required" | "maximum" | null;

/** The two sessions a day can run: a morning and an afternoon, every day of the event. */
export type DaySessionChoice = "AM" | "PM";

/**
 * The sessions worth keeping for a day selection: only days the player is playing, and only days the
 * event has. Saving a session for a deselected day would leave a morning on a day the player is not
 * in.
 *
 * The event's days are passed by number, not as a count, because a non-playing day in the middle
 * leaves gaps: days 1, 2 and 4 are three days, but day 4 is not day 3. A plain number is still
 * accepted and read as days 1 to that number.
 */
export function pruneDaySessions(
  selected: number[],
  sessions: Record<number, DaySessionChoice>,
  validDayNumbers: readonly number[] | number,
): Record<number, DaySessionChoice> {
  const valid =
    typeof validDayNumbers === "number"
      ? new Set(
          Array.from({ length: Math.max(0, Math.floor(validDayNumbers)) }, (_, index) => index + 1),
        )
      : new Set(validDayNumbers);
  const kept: Record<number, DaySessionChoice> = {};
  for (const [key, value] of Object.entries(sessions)) {
    const day = Number(key);
    if (!Number.isInteger(day)) continue;
    if (!valid.has(day)) continue;
    if (!selected.includes(day)) continue;
    kept[day] = value;
  }
  return kept;
}

/**
 * The participation-rule check shared by the public form and the desk's day editor. It is a pure
 * function so the same rule is tested without a browser, and the database repeats the check.
 */
export function daySelectionProblem(
  selected: number[],
  required: number | null,
  max: number | null,
): DaySelectionProblem {
  if (required !== null && selected.length !== required) return "required";
  if (max !== null && selected.length > max) return "maximum";
  return null;
}
