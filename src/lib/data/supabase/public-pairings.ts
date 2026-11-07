import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { mapPublicPairingRows } from "./mappers";

/**
 * The database has not had 20261108000300 yet. PostgREST answers with PGRST202 when a function is
 * missing from its schema cache; anything else is a real failure and is thrown.
 */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

export async function loadPublicPairings(
  client: SupabaseClient<Database>,
  tournamentId?: string | null,
) {
  const byDay = await client.rpc("public_pairings_by_day", {
    p_tournament: tournamentId ?? null,
  });
  if (!byDay.error) return mapPublicPairingRows(byDay.data ?? []);
  if (!isMissingFunction(byDay.error)) {
    throw new Error(`Could not load public pairings: ${byDay.error.message}`);
  }

  // The day column is new. Without its migration the old function still serves one day's rows.
  const legacy = await client.rpc("public_pairings", {
    p_tournament: tournamentId ?? null,
  });
  if (legacy.error) throw new Error(`Could not load public pairings: ${legacy.error.message}`);
  return mapPublicPairingRows(legacy.data ?? []);
}
