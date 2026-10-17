import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { mapPublicPairingRows } from "./mappers";

export async function loadPublicPairings(
  client: SupabaseClient<Database>,
  tournamentId?: string | null,
) {
  const { data, error } = await client.rpc("public_pairings", {
    p_tournament: tournamentId ?? null,
  });
  if (error) throw new Error(`Could not load public pairings: ${error.message}`);
  return mapPublicPairingRows(data ?? []);
}
