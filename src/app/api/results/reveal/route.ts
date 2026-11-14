import { withApiTiming } from "@/lib/api/timing";
import { loadPublicReleaseState, loadPublicRevealState } from "@/lib/data/supabase/public-programme";
import type { RevealPoll } from "@/lib/public/results-reveal";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

/**
 * What the results holding screen asks while it waits: are the results and the player list still
 * held, and is there a reveal time to count down to?
 *
 * Two booleans and a timestamp. No player, score, tee, photo or stored `publish_views` object is in
 * the answer, so this endpoint cannot be used to read around the database gate: releasing is still
 * the only way the results become readable, and that happens through `set_public_release()`.
 */
const CACHE = "public, s-maxage=3, stale-while-revalidate=6";
const NO_STORE = "no-store";

export const GET = withApiTiming("GET /api/results/reveal", async () => {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 404, headers: { "Cache-Control": NO_STORE } },
    );
  }

  try {
    const client = createSupabasePublicClient();
    const [release, reveal] = await Promise.all([
      loadPublicReleaseState(client),
      loadPublicRevealState(client),
    ]);
    const body: RevealPoll = {
      held: {
        leaderboard: release ? release.leaderboard === false : false,
        roster: release ? release.roster === false : false,
      },
      revealAt: reveal?.revealAt ?? null,
    };
    return Response.json(body, { headers: { "Cache-Control": CACHE } });
  } catch {
    return Response.json(
      { error: "The public release state could not be read." },
      { status: 503, headers: { "Cache-Control": NO_STORE } },
    );
  }
});
