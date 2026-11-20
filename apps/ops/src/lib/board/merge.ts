import type { BoardCard } from "./repo";

/**
 * Merging realtime hints into the board.
 *
 * The database broadcasts each row change on the private `ws:board` channel. An event is a hint,
 * so it is applied only when it is newer than what we hold. A card with an edit still in flight is
 * skipped, because its local row is ahead of the broadcast. An event equal to the row we already
 * have is our own echo and changes nothing.
 */

export type BoardEvent = { kind: "upsert"; card: BoardCard } | { kind: "delete"; id: string };

const NOTHING_IN_FLIGHT: ReadonlySet<string> = new Set();

/** The newer of two rows for the same card. Equal timestamps keep the current row. */
export function mergeCard(current: BoardCard, incoming: BoardCard): BoardCard {
  const incomingAt = Date.parse(incoming.updated_at);
  const currentAt = Date.parse(current.updated_at);
  if (Number.isNaN(incomingAt)) return current;
  if (Number.isNaN(currentAt)) return incoming;
  return incomingAt > currentAt ? incoming : current;
}

/** Apply an upsert. Returns the same array when nothing changed, so React can skip the render. */
export function upsertCard(
  cards: BoardCard[],
  incoming: BoardCard,
  inFlight: ReadonlySet<string> = NOTHING_IN_FLIGHT,
): BoardCard[] {
  if (inFlight.has(incoming.id)) return cards;

  const index = cards.findIndex((card) => card.id === incoming.id);
  if (index < 0) return [...cards, incoming];

  const current = cards[index];
  if (current === undefined) return [...cards, incoming];
  const merged = mergeCard(current, incoming);
  if (merged === current) return cards;

  const next = [...cards];
  next[index] = merged;
  return next;
}

export function removeCard(
  cards: BoardCard[],
  id: string,
  inFlight: ReadonlySet<string> = NOTHING_IN_FLIGHT,
): BoardCard[] {
  if (inFlight.has(id)) return cards;
  if (!cards.some((card) => card.id === id)) return cards;
  return cards.filter((card) => card.id !== id);
}
