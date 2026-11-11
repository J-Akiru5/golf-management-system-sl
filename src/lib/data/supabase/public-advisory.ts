import type { SupabaseClient } from "@supabase/supabase-js";
import { type PublicAdvisory, parsePublicAdvisory } from "@/lib/public/advisory";
import type { Database } from "@/lib/supabase/types";

/**
 * The database has not applied 20261112000100 yet. PostgREST answers with PGRST202 when a function
 * is missing from its schema cache; that is "no advisory", exactly as it was before the feature.
 * Anything else is a real failure and is thrown, so the page's own error handling still sees it.
 */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

/**
 * The organizer's advisory for one event, through the anonymous read path. The database returns only
 * the five allow-listed keys, and only while the event is published and the `advisory` surface is
 * released; a held advisory, an unpublished event or an older database all answer null.
 */
export async function loadPublicAdvisory(
  client: SupabaseClient<Database>,
  tournamentId?: string | null,
): Promise<PublicAdvisory | null> {
  const { data, error } = await client.rpc("public_advisory", {
    p_tournament: tournamentId ?? null,
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw new Error(`Could not load the public advisory: ${error.message}`);
  }
  return parsePublicAdvisory(data);
}
