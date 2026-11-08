import { loadPublicPairings } from "@/lib/data/supabase/public-pairings";
import { pairingsSignature } from "@/lib/public/pairings-live";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/**
 * Which published version of the pairings is current. The public pairings page polls this and
 * reloads itself when the answer changes, so a publish reaches open browsers without a refresh.
 *
 * It answers only what the page already shows to anyone: the version and the time of the published
 * snapshot, built by the same loader the page uses, so the two can never disagree about what
 * "current" means. A draft edit does not change it: the public never sees the live board.
 *
 * Shared caching absorbs the polling. Every open page asking every 30 seconds becomes about one
 * database read per 10 seconds, however many people are watching.
 */
const SHARED = "public, s-maxage=10, stale-while-revalidate=20";
const NEVER = "no-store";

export async function GET(): Promise<Response> {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 404, headers: { "Cache-Control": NEVER } },
    );
  }
  try {
    const data = await loadPublicPairings(createSupabasePublicClient());
    const published = data?.published ?? null;
    return Response.json(
      {
        signature: pairingsSignature(published),
        published: published !== null,
        version: published?.version ?? null,
        at: published?.at ?? null,
      },
      { headers: { "Cache-Control": SHARED } },
    );
  } catch {
    // A failed read is never cached, and the page treats it as "ask again later".
    return Response.json(
      { error: "The published pairings could not be read." },
      { status: 502, headers: { "Cache-Control": NEVER } },
    );
  }
}
