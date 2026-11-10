import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapPublicProgramme,
  type PublicReleaseState,
  type PublicReleaseSurface,
  parsePublicReleaseState,
} from "@/lib/data/public";
import type { PublicProgramme } from "@/lib/data/types";
import type { Database } from "@/lib/supabase/types";

/**
 * The last applied public function may be older than the code. A database without this particular
 * read answers with PGRST202; callers treat that as "no release state", which means every surface
 * is released, exactly as it was before the policy existed.
 */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

/**
 * The anonymous read behind the day schedule, the player cards and the rules of play. The database
 * function returns one allow-listed JSON document, and only while the event is published; the
 * pairings themselves still come from the frozen published snapshot. A held section arrives empty.
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

/**
 * Which public surfaces the desk is holding for one event. The database returns booleans and the
 * event id only; it never returns the stored publish_views object or an auth user id. This read
 * works for an unpublished event because the release screen must be usable while the event is
 * still in draft, but it carries no player, tee, result or photo data.
 */
export async function loadPublicReleaseState(
  client: SupabaseClient<Database>,
  tournamentId?: string | null,
): Promise<PublicReleaseState | null> {
  const { data, error } = await client.rpc("public_release_state", {
    p_tournament: tournamentId ?? null,
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw new Error(`Could not load the public release state: ${error.message}`);
  }
  return parsePublicReleaseState(data);
}

/**
 * Changes one release key. The database checks the caller's role through `has_club_role` and
 * refuses anyone who is not an owner or organizer (42501); anon cannot execute this function at all.
 * The returned document is the new release state, so the caller never has to guess what the update
 * produced.
 */
export async function setPublicRelease(
  client: SupabaseClient<Database>,
  tournamentId: string,
  surface: PublicReleaseSurface,
  released: boolean,
): Promise<PublicReleaseState | null> {
  const { data, error } = await client.rpc("set_public_release", {
    p_tournament: tournamentId,
    p_surface: surface,
    p_released: released,
  });
  if (error) throw new Error(`Could not change the public release: ${error.message}`);
  return parsePublicReleaseState(data);
}
