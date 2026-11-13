/**
 * Finds the card that a submit just wrote.
 *
 * A submit returns the whole round, not the row it wrote, so the screen cannot approve the new card
 * from the response alone. The ids that existed before the submit tell the new card apart from an
 * older one for the same player and marker, and the revision settles it when a correction arrives
 * with an id the screen has already seen.
 *
 * This only recognises a card. It never decides a score and never approves anything.
 */
import type { Scorecard } from "./types";

export interface SubmittedCardMatch {
  playerId: string;
  scorerId: string;
  /** The card ids that were on screen before the submit. */
  knownIds: ReadonlySet<string>;
}

/**
 * The submitted card for this player and marker, or null when the round holds none.
 *
 * A card with an id the screen has not seen is preferred, because that is the one the submit just
 * wrote. When every submitted card is already known, the newest revision is returned: the database
 * recognised the request as an existing card, so that card is the one the desk just saved.
 */
export function findSubmittedCard(
  cards: readonly Scorecard[],
  match: SubmittedCardMatch,
): Scorecard | null {
  const submitted = cards.filter(
    (card) =>
      card.playerId === match.playerId &&
      card.scorerId === match.scorerId &&
      card.status === "submitted",
  );
  if (submitted.length === 0) return null;

  const fresh = submitted.filter((card) => !match.knownIds.has(card.id));
  const candidates = fresh.length > 0 ? fresh : submitted;
  return candidates.reduce((best, card) => (card.revision > best.revision ? card : best));
}
