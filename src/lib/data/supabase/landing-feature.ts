import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * The desk's home page feature setting.
 *
 * Which event the public home page features is a club decision made in Setup, not a value the page
 * derives. `tournaments.landing_featured` is readable by club members under the table's RLS, and
 * `set_landing_feature()` is the only writer: it checks the caller's role and clears any other
 * featured event of the same club.
 */

/** The parsed setting, or null when the read did not produce a usable row. */
export function parseLandingFeature(value: unknown): { featured: boolean } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return { featured: row.landing_featured === true };
}

/** The setter's reply, `{ tournamentId, featured }`, with the requested value as the fallback. */
export function parseLandingFeatureResult(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fallback;
  const result = value as Record<string, unknown>;
  return typeof result.featured === "boolean" ? result.featured : fallback;
}

/**
 * Reads one event's feature setting.
 *
 * A failed read returns null, which includes the column not existing yet (the migration has not
 * reached the project) and the row not being visible. The card treats null as "not available yet"
 * rather than as "off", so a failure never looks like a setting the organizer turned off.
 */
export async function loadLandingFeature(
  client: SupabaseClient<Database>,
  tournamentId: string,
): Promise<{ featured: boolean } | null> {
  const { data, error } = await client
    .from("tournaments")
    .select("landing_featured")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error || !data) return null;
  return parseLandingFeature(data);
}

/**
 * Turns the home page feature on or off for one event.
 *
 * The database enforces the role and the one-event-per-club rule, so a refusal arrives as a plain
 * message from the function and is thrown unchanged for the card to show.
 */
export async function setLandingFeature(
  client: SupabaseClient<Database>,
  tournamentId: string,
  featured: boolean,
): Promise<boolean> {
  const { data, error } = await client.rpc("set_landing_feature", {
    p_tournament: tournamentId,
    p_featured: featured,
  });
  if (error) throw new Error(error.message);
  return parseLandingFeatureResult(data, featured);
}
