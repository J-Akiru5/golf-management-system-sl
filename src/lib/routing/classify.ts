import type { CategoryRule, FlightRule, Gender, Registration } from "./types";

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
 * The category a player joins when their birthdate or gender is not on file: the club's open
 * division, which is the men's (or any-gender) category with the lowest age band. The draw is
 * scheduled first so the field can play; the tee and the playing handicap are corrected once the
 * missing details arrive for scoring.
 */
export function defaultCategoryFor(rules: CategoryRule[]): CategoryRule | null {
  const open = rules
    .filter((rule) => rule.gender === "M" || rule.gender === "any")
    .sort((a, b) => a.minAge - b.minAge || a.name.localeCompare(b.name));
  return open[0] ?? rules[0] ?? null;
}

/**
 * The number a team is classed on: the average of its members' indexes, rounded to one decimal, which
 * is the precision the class ranges are written in. A blank index counts as 0, the same rule the
 * single-player draw uses, so a pair is never held back by a missing number.
 */
export function averageIndex(indexes: (number | null)[]): number {
  if (indexes.length === 0) return 0;
  const total = indexes.reduce<number>((sum, index) => sum + (index ?? 0), 0);
  return Math.round((total / indexes.length) * 10) / 10;
}

/**
 * Classes a member-guest pair together: both partners take the class that covers the average of their
 * indexes, so the two play in one class and are never split into different groups. A team whose
 * average covers no class, or more than one, keeps the classes it was given player by player.
 */
export function applyTeamClasses(
  registrations: Registration[],
  flights: FlightRule[],
  maxIndex?: number,
): void {
  const teams = new Map<string, Registration[]>();
  for (const reg of registrations) {
    if (reg.status !== "ok" || !reg.teamKey) continue;
    const members = teams.get(reg.teamKey);
    if (members) members.push(reg);
    else teams.set(reg.teamKey, [reg]);
  }
  for (const members of teams.values()) {
    if (members.length < 2) continue;
    // A validated card class is the desk's decision. Do not re-cut the pair on the index average.
    const stored = members.filter((member) => member.classSource === "stored");
    if (stored.length > 0) {
      const classes = [
        ...new Set(
          stored
            .map((member) => member.flightId)
            .filter((id): id is string => id !== null && id !== undefined),
        ),
      ];
      if (classes.length === 1) {
        for (const member of members) {
          if (member.flightId !== classes[0]) {
            member.flightId = classes[0] as string;
            member.reasons.push("Class follows the pair's stored card class.");
          }
        }
        continue;
      }
      if (classes.length > 1) {
        for (const member of members) {
          member.reasons.push("The pair's stored card classes differ; the desk must choose one.");
        }
        continue;
      }
    }
    // An index above the event maximum counts as the maximum, the same cap the single-player draw uses.
    const value = averageIndex(
      members.map((member) =>
        member.index !== null && maxIndex !== undefined
          ? Math.min(member.index, maxIndex)
          : member.index,
      ),
    );
    const matches = matchFlights(flights, value);
    if (matches.length !== 1) continue;
    const flight = matches[0] as FlightRule;
    for (const member of members) {
      member.flightId = flight.id;
      member.reasons.push(`Class ${flight.name} is cut on the pair's average index ${value}.`);
    }
  }
}

/**
 * Finds the classes whose band contains the value. A class is not scoped to a category or a tee: the
 * same ranges apply to every player, which is what makes class the priority over the tee group.
 */
export function matchFlights(flights: FlightRule[], value: number): FlightRule[] {
  return flights.filter((f) => value >= f.min && value <= f.max);
}
