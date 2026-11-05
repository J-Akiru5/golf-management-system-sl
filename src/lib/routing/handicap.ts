import type { Tee } from "./types";

/**
 * WHS course handicap before rounding: Index x (Slope / 113) + (Course Rating - Par).
 */
export function rawCourseHandicap(index: number, tee: Tee): number {
  return index * (tee.slope / 113) + (tee.courseRating - tee.par);
}

/**
 * The WHS course handicap: the raw number rounded half up, with no allowance applied. This is the
 * number the club's printed Course Handicap Tables carry, so an index and a tee are enough to read
 * the same value off the sheet without storing the table.
 */
export function courseHandicap(index: number, tee: Tee): number {
  return roundStrokes(rawCourseHandicap(index, tee));
}

/**
 * Playing handicap: the course handicap with the allowance applied, rounded once at the end. At the
 * 100% allowance these events use, it equals the course handicap.
 * Math.round sends .5 up toward positive infinity, which matches the WHS rounding rule.
 */
export function playingHandicap(index: number, tee: Tee, allowance: number): number {
  return roundStrokes(rawCourseHandicap(index, tee) * allowance);
}

/**
 * Rounded strokes, with negative zero normalised: a player whose handicap lands between 0 and -0.5
 * has a handicap of 0, and a sheet must not print "-0".
 */
function roundStrokes(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

/** Whole years between birthdate and the given day. Both are ISO dates, compared as calendar dates. */
export function ageOn(birthdate: string, onDate: string): number {
  const [by, bm, bd] = birthdate.split("-").map(Number);
  const [oy, om, od] = onDate.split("-").map(Number);
  if (!by || !bm || !bd || !oy || !om || !od) {
    throw new Error(`Invalid date: ${birthdate} / ${onDate}`);
  }
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}
