/**
 * The class name a desk screen prints under a player. A player with no class, or a view that did
 * not load one, reads as "No class"; an internal flight id must never be shown.
 */
export function classLabel(flightName: string | null | undefined): string {
  return flightName ?? "No class";
}
