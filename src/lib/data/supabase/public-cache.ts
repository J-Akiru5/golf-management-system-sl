import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import type { PublicReleaseState } from "@/lib/data/public";
import { loadPublishedRounds } from "@/lib/data/public-results";
import { loadPublicTeamCards, type PublicTeamCards } from "@/lib/data/public-team-cards";
import type { PublicTeamLeaderboardData } from "@/lib/data/public-team-leaderboard";
import { loadPublicTeamLeaderboard } from "@/lib/data/public-team-leaderboard";
import type { PublicProgramme } from "@/lib/data/types";
import type { PublicAdvisory } from "@/lib/public/advisory";
import { liveSignature, resultsSignature } from "@/lib/public/live-signature";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { loadPublicAdvisory } from "./public-advisory";
import { loadPublicPairings } from "./public-pairings";
import {
  loadPublicProgramme,
  loadPublicReleaseState,
  loadPublicRevealState,
} from "./public-programme";

/**
 * The public pages read the same frozen publication for every visitor, and the only thing that
 * changes it is the desk publishing. Paying a database round trip per page view meant that moving
 * between Pairings, Players and the Leaderboard cost four requests each time, which is what made
 * those screens feel slow on a phone.
 *
 * Each read is kept in Next's data cache for a short window. The pages themselves still render per
 * request (they read the language cookie), so the translation and the signed-in "You" marker stay
 * exactly as they were; only the anonymous reads are shared.
 *
 * Freshness is unchanged in every case that matters:
 *   - a publish or unpublish clears the whole tag through `/api/revalidate-pairings`;
 *   - a release toggle clears it too, so holding a section takes effect at once;
 *   - anything else (a manual advisory edit in the database, say) appears within the window.
 */
export const PUBLIC_DATA_TAG = "public-published";

/** Long enough to cover a visit and its tab hopping; short enough to be a backstop. */
export const PUBLIC_DATA_SECONDS = 30;

/** A stable cache key from parts that may contain ids, trimmed so a long id list stays a key. */
export function publicCacheKey(prefix: string, parts: readonly string[]): string {
  const joined = parts.join("|");
  if (joined.length <= 120) return `${prefix}:${joined}`;
  return `${prefix}:${createHash("sha256").update(joined).digest("hex").slice(0, 24)}`;
}

function cachedPublicRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  return unstable_cache(read, [key], {
    revalidate: PUBLIC_DATA_SECONDS,
    tags: [PUBLIC_DATA_TAG],
  })();
}

const tournamentKey = (tournamentId?: string | null) => tournamentId ?? "current";

/** The frozen published pairings, shared by `/pairings` and the player's group read. */
export function readPublicPairings(
  tournamentId?: string | null,
): Promise<Awaited<ReturnType<typeof loadPublicPairings>>> {
  return cachedPublicRead(publicCacheKey("public-pairings", [tournamentKey(tournamentId)]), () =>
    loadPublicPairings(createSupabasePublicClient(), tournamentId),
  );
}

/** The day schedule, player cards and rules: one allow-listed document from the database. */
export function readPublicProgramme(tournamentId?: string | null): Promise<PublicProgramme | null> {
  return cachedPublicRead(publicCacheKey("public-programme", [tournamentKey(tournamentId)]), () =>
    loadPublicProgramme(createSupabasePublicClient(), tournamentId),
  );
}

/** Which surfaces the desk has released. Booleans only, never player data. */
export function readPublicReleaseState(
  tournamentId?: string | null,
): Promise<PublicReleaseState | null> {
  return cachedPublicRead(publicCacheKey("public-release", [tournamentKey(tournamentId)]), () =>
    loadPublicReleaseState(createSupabasePublicClient(), tournamentId),
  );
}

/**
 * The reveal time of a results blackout, or null. Read only while the results are held, so an
 * ordinary visit never pays for it; a database without the function answers null.
 */
export function readPublicRevealState(
  tournamentId?: string | null,
): Promise<Awaited<ReturnType<typeof loadPublicRevealState>>> {
  return cachedPublicRead(publicCacheKey("public-reveal", [tournamentKey(tournamentId)]), () =>
    loadPublicRevealState(createSupabasePublicClient(), tournamentId),
  );
}

/** The organizer's advisory banner for today. */
export function readPublicAdvisory(tournamentId?: string | null): Promise<PublicAdvisory | null> {
  return cachedPublicRead(publicCacheKey("public-advisory", [tournamentKey(tournamentId)]), () =>
    loadPublicAdvisory(createSupabasePublicClient(), tournamentId),
  );
}

/** The cumulative team table built from every published round. */
export function readPublicTeamLeaderboard(
  tournamentId?: string | null,
): Promise<PublicTeamLeaderboardData | null> {
  return cachedPublicRead(publicCacheKey("public-teams", [tournamentKey(tournamentId)]), () =>
    loadPublicTeamLeaderboard(createSupabasePublicClient(), tournamentId),
  );
}

/**
 * Both partners' frozen cards for the teams on screen. Keyed by the players asked for, because a
 * category or class filter changes the set; the cards themselves only change on a publish.
 */
export function readPublicTeamCards(
  playerIds: readonly string[],
  tournamentId?: string | null,
): Promise<PublicTeamCards> {
  const ids = [...new Set(playerIds)].sort();
  return cachedPublicRead(
    publicCacheKey("public-team-cards", [tournamentKey(tournamentId), ...ids]),
    () => loadPublicTeamCards(createSupabasePublicClient(), ids, tournamentId ?? null),
  );
}

/**
 * The published results, as one short string: the version and time of each published round.
 *
 * The public leaderboard, All scores and the roster poll it while the tab is visible, so a round
 * the desk publishes reaches an open phone without a reload. It is a cached read under the same
 * tag as every other public read, so a publish clears it at once and the steady state is one small
 * query per window, not one per visitor. A database without the function, or a failed read, answers
 * `unavailable` rather than failing the whole page: the next check tries again.
 */
export function readPublicResultsSignature(tournamentId?: string | null): Promise<string> {
  return cachedPublicRead(
    publicCacheKey("public-results-signature", [tournamentKey(tournamentId)]),
    async () => {
      try {
        const rounds = await loadPublishedRounds(createSupabasePublicClient());
        return resultsSignature(rounds);
      } catch {
        return "unavailable";
      }
    },
  );
}

/**
 * Everything a public page shows, as one string: the published pairings, the release keys and the
 * published rounds. `/api/revalidate-pairings` (GET) serves it to the pages' poll, and the page that
 * rendered it passes the same string down, so the two are compared like for like.
 *
 * Composed from the cached reads above rather than cached again: each part keeps its own key, so a
 * poll never costs more than the page did.
 */
export async function readPublicLiveSignature(tournamentId?: string | null): Promise<string> {
  const [pairings, release, results] = await Promise.all([
    readPublicPairings(tournamentId).catch(() => null),
    readPublicReleaseState(tournamentId).catch(() => null),
    readPublicResultsSignature(tournamentId),
  ]);
  return liveSignature({
    published: pairings?.published ?? null,
    release,
    results,
  });
}
