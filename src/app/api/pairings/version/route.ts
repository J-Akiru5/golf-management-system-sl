import {
  etagMatches,
  PAIRINGS_VERSION_CACHE,
  PAIRINGS_VERSION_NO_STORE,
  PairingsVersionUnavailable,
  pairingsVersionEtag,
  readPairingsVersion,
} from "@/lib/api/pairings-version";
import { withApiTiming } from "@/lib/api/timing";

export const dynamic = "force-dynamic";

/**
 * Legacy response shape, kept for the current `PairingsLive` poller and any old client.
 * `/api/v1/pairings/version` is the versioned, enveloped contract; this path remains until the
 * removal date recorded in `docs/API.md`.
 *
 * The body is unchanged. The timing layer adds `X-Request-Id` and `Server-Timing`, and the shared
 * cache and ETag keep the poll from reaching the database on every open page.
 */
export const GET = withApiTiming("GET /api/pairings/version", async (request) => {
  try {
    const version = await readPairingsVersion();
    const etag = pairingsVersionEtag(version);
    if (etagMatches(request.headers.get("if-none-match"), etag)) {
      return new Response(null, {
        status: 304,
        headers: { "Cache-Control": PAIRINGS_VERSION_CACHE, ETag: etag },
      });
    }
    return Response.json(version, {
      headers: { "Cache-Control": PAIRINGS_VERSION_CACHE, ETag: etag },
    });
  } catch (error) {
    if (error instanceof PairingsVersionUnavailable) {
      return Response.json(
        { error: "Supabase is not configured." },
        { status: 404, headers: { "Cache-Control": PAIRINGS_VERSION_NO_STORE } },
      );
    }
    return Response.json(
      { error: "The published pairings could not be read." },
      { status: 502, headers: { "Cache-Control": PAIRINGS_VERSION_NO_STORE } },
    );
  }
});
