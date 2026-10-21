export type DaySelectionProblem = "required" | "maximum" | null;

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
