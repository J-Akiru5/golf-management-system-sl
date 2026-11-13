/**
 * Turning a card reading into player suggestions.
 *
 * The reader returns a name, holes and the written total. Tee, the HDCP box and the group are not
 * read today, so they stay absent and the matcher is given the name only. The matcher proposes; the
 * desk confirms.
 *
 * Pure: no I/O.
 */

import type { CardReading, MatchOptions, RoundPlayer } from "../match";
import { matchPlayers } from "../match";
import type { ScanReading, ScanSuggestion } from "./types";

/**
 * Proposes players for one reading, best first. A reading with no name returns nothing. This never
 * picks a player.
 */
export function suggestForScan(
  reading: ScanReading | null,
  players: readonly RoundPlayer[],
  options?: MatchOptions,
): ScanSuggestion[] {
  const name = reading?.name?.trim() ?? "";
  if (name === "") return [];

  const card: CardReading = { name };
  return matchPlayers(card, players, options).map((candidate) => ({
    playerId: candidate.playerId,
    score: candidate.score,
    reasons: candidate.reasons,
    hasCard: candidate.hasCard,
  }));
}
