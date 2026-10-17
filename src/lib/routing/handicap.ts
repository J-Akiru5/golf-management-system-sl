import type { Tee } from "./types";

/**
 * WHS course handicap before rounding: Index x (Slope / 113) + (Course Rating - Par).
 */
export function rawCourseHandicap(index: number, tee: Tee): number {
  return index * (tee.slope / 113) + (tee.courseRating - tee.par);
}

/**
 * Playing handicap: the course handicap with the allowance applied, rounded once at the end.
 * Math.round sends .5 up toward positive infinity, which matches the WHS rounding rule.
 */
export function playingHandicap(index: number, tee: Tee, allowance: number): number {
  return Math.round(rawCourseHandicap(index, tee) * allowance);
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
