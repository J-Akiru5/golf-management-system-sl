/**
 * What the event strip shows.
 *
 * It always has at least two cards when there is at most one open event: the event itself, then an
 * explicit "nothing else scheduled" card. That pair is the point. Before, a single event produced a
 * static card and no events produced no strip at all, so a visitor could not tell an empty calendar
 * from a read that had failed. `null` is that empty card, and it carries no event data because there
 * is none to carry.
 *
 * With two or more open events the strip simply shows them, and no empty card is invented.
 */
export function carouselSlides<T>(events: T[]): (T | null)[] {
  return events.length > 1 ? events : [...events, null];
}
