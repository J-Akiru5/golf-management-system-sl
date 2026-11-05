import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Moves drawn groups off a class row the desk is removing.
 *
 * The database will not delete a class that a draw group still names, and it skips that row in
 * silence instead of failing the save. A class set therefore used to keep whatever extra rows a
 * previous draw pointed at, and those rows came back on the next reload. Before the save removes
 * them, this moves their groups onto the class that replaces them: the same name when one exists,
 * otherwise the class whose band covers the removed one. The board is marked out of date by the same
 * save, so nothing is presented as current, but the groups and their pairings are kept.
 */

const DATABASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UnlistedResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function callUnlisted(
  client: SupabaseClient<Database>,
  name: string,
  args: Record<string, unknown>,
): PromiseLike<UnlistedResult> {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<UnlistedResult>;
  return rpc(name, args);
}

export async function detachDroppedClassGroups(
  client: SupabaseClient<Database>,
  tournamentId: string,
  keepIds: string[],
): Promise<void> {
  // Ids the desk invented for rows that were never saved are not uuids and cannot be sent.
  const keep = keepIds.filter((id) => DATABASE_ID.test(id));
  const { error } = await callUnlisted(client, "detach_dropped_class_groups", {
    p_tournament: tournamentId,
    p_keep: keep,
  });
  if (!error) return;
  const missing =
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /function .* does not exist/i.test(error.message);
  // A database without migration 20261105000400 still saves; the removed rows may survive, which is
  // the old behaviour rather than a new failure.
  if (missing) return;
  throw new Error(`Could not move the drawn groups off the removed classes: ${error.message}`);
}
