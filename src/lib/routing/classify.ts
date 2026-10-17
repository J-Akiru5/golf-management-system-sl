import type { CategoryRule, FlightRule, Gender } from "./types";

/**
 * Picks the category whose gender and age band match. Returns the matches so the caller can
 * flag overlaps instead of silently choosing one.
 */
export function matchCategories(
  rules: CategoryRule[],
  gender: Gender,
  age: number,
): CategoryRule[] {
  return rules.filter(
    (r) =>
      (r.gender === "any" || r.gender === gender) &&
      age >= r.minAge &&
      (r.maxAge === null || age <= r.maxAge),
  );
}

/** Finds the flight in a category whose range contains the value. */
export function matchFlights(
  flights: FlightRule[],
  categoryId: string,
  value: number,
): FlightRule[] {
  return flights.filter((f) => f.categoryId === categoryId && value >= f.min && value <= f.max);
}
