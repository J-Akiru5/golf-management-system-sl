import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicReleaseState } from "@/lib/data/public";
import { mergeRevealKey, storedRevealAt } from "@/lib/public/results-reveal";
import type { Database, Json } from "@/lib/supabase/types";
import { setPublicRelease } from "./public-programme";

/**
 * The desk's side of the results blackout.
 *
 * The hold itself uses `set_public_release()`, the same enforced function the release card already
 * calls, so nothing here can widen what a signed-out reader may see. The reveal *time* is a key
 * inside `tournaments.publish_views`, written by the organizer's own row update: the table's RLS
 * policy already allows an owner or organizer to update the event, and `publish_allows()` only ever
 * looks up the key it is asked about, so an extra key is inert to the database gate. The public
 * reads it through `public_reveal_state()` (20261115000100, not applied yet); without that function
 * the hold and the manual reveal still work and the public shows the holding screen with no
 * countdown.
 *
 * Writing `publish_views` is a read-merge-write because the column is one JSON object shared with
 * the release switches. The merge keeps every other key exactly as it was, and the card does the
 * calls in sequence for one organizer, so a toggle made in a different tab in the same instant is
 * the only case this could overwrite; the release card's own writes go through the function, which
 * re-reads the row under a lock.
 */

/** The reveal time stored on the event row, or null. Owner/organizer read only. */
export async function loadStoredReveal(
  client: SupabaseClient<Database>,
  tournamentId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("tournaments")
    .select("publish_views")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the reveal time: ${error.message}`);
  return storedRevealAt(data?.publish_views);
}

/** Sets or clears the reveal time inside `publish_views`, leaving every other key alone. */
export async function saveStoredReveal(
  client: SupabaseClient<Database>,
  tournamentId: string,
  revealAt: string | null,
): Promise<void> {
  const { data, error } = await client
    .from("tournaments")
    .select("publish_views")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the event before saving: ${error.message}`);

  const { data: user } = await client.auth.getUser();
  const next = mergeRevealKey(data?.publish_views, revealAt);
  const { error: writeError } = await client
    .from("tournaments")
    .update({
      publish_views: next as Json,
      publish_views_updated_at: new Date().toISOString(),
      publish_views_updated_by: user.user?.id ?? null,
    })
    .eq("id", tournamentId);
  if (writeError) throw new Error(`Could not save the reveal time: ${writeError.message}`);
}

/** Holds the results and the player list through the enforced setter. */
export async function holdResults(
  client: SupabaseClient<Database>,
  tournamentId: string,
): Promise<PublicReleaseState | null> {
  let state = await setPublicRelease(client, tournamentId, "leaderboard", false);
  const roster = await setPublicRelease(client, tournamentId, "roster", false);
  if (roster) state = roster;
  return state;
}

/** Releases both keys again. Keys that are already released are skipped. */
export async function releaseResults(
  client: SupabaseClient<Database>,
  tournamentId: string,
  state: PublicReleaseState | null,
): Promise<PublicReleaseState | null> {
  let next = state;
  const leaderboardHeld = next === null || next.leaderboard === false;
  const rosterHeld = next === null || next.roster === false;
  if (leaderboardHeld) {
    next = (await setPublicRelease(client, tournamentId, "leaderboard", true)) ?? next;
  }
  if (rosterHeld) {
    next = (await setPublicRelease(client, tournamentId, "roster", true)) ?? next;
  }
  return next;
}
