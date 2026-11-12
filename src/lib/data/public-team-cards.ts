import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalScorecard } from "@/lib/player/portal";
import type { Database } from "@/lib/supabase/types";
import { loadPublicPlayerProfile } from "./public-profile";

/** The frozen cards of every player on the teams the leaderboard shows, keyed by player id. */
export type PublicTeamCards = Record<string, PortalScorecard[]>;

/**
 * Reads each partner's published cards through the same function the public profile uses, so the
 * leaderboard shows nothing the profile would not. One player failing leaves that player without a
 * card instead of taking the whole leaderboard down.
 */
export async function loadPublicTeamCards(
  client: SupabaseClient<Database>,
  playerIds: string[],
  tournamentId: string | null,
): Promise<PublicTeamCards> {
  const ids = [...new Set(playerIds)];
  const results = await Promise.allSettled(
    ids.map((id) => loadPublicPlayerProfile(client, id, tournamentId)),
  );
  const cards: PublicTeamCards = {};
  ids.forEach((id, index) => {
    const result = results[index];
    if (result?.status === "fulfilled" && result.value && result.value.cards.length > 0) {
      cards[id] = result.value.cards;
    }
  });
  return cards;
}
