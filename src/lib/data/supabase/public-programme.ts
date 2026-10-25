import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPublicProgramme } from "@/lib/data/public";
import type { PublicProgramme } from "@/lib/data/types";
import type { Database } from "@/lib/supabase/types";

/**
 * The anonymous read behind the day schedule, the player cards and the rules of play. The database
 * function returns one allow-listed JSON document, and only while the event is published; the
 * pairings themselves still come from the frozen published snapshot.
 */
export async function loadPublicProgramme(
  client: SupabaseClient<Database>,
  tournamentId?: string | null,
): Promise<PublicProgramme | null> {
  const { data, error } = await client.rpc("public_programme", {
    p_tournament: tournamentId ?? null,
  });
  if (error) throw new Error(`Could not load the event programme: ${error.message}`);
  return mapPublicProgramme(data);
}
