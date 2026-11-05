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

/**
 * Finds the classes whose band contains the value. A class is not scoped to a category or a tee: the
 * same ranges apply to every player, which is what makes class the priority over the tee group.
 */
export function matchFlights(flights: FlightRule[], value: number): FlightRule[] {
  return flights.filter((f) => value >= f.min && value <= f.max);
}
