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
 * The versioned public contract for the pairings version.
 *
 * Success is the regulation envelope: `{ data, meta: { request_id } }`. Failure is
 * `{ error: { code, message, request_id } }`. The legacy `/api/pairings/version` path keeps its old
 * body until the removal date in `docs/API.md`; both paths call the same read.
 */
export const GET = withApiTiming("GET /api/v1/pairings/version", async (request, requestId) => {
  try {
    const version = await readPairingsVersion();
    const etag = pairingsVersionEtag(version);
    if (etagMatches(request.headers.get("if-none-match"), etag)) {
      return new Response(null, {
        status: 304,
        headers: { "Cache-Control": PAIRINGS_VERSION_CACHE, ETag: etag },
      });
    }
    return Response.json(
      { data: version, meta: { request_id: requestId } },
      { headers: { "Cache-Control": PAIRINGS_VERSION_CACHE, ETag: etag } },
    );
  } catch (error) {
    const unavailable = error instanceof PairingsVersionUnavailable;
    return Response.json(
      {
        error: {
          code: "UNAVAILABLE",
          message: unavailable
            ? "Supabase is not configured."
            : "The published pairings could not be read.",
          request_id: requestId,
        },
      },
      {
        status: 503,
        headers: { "Cache-Control": PAIRINGS_VERSION_NO_STORE },
      },
    );
  }
});
