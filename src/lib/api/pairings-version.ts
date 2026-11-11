import { loadPublicPairings } from "@/lib/data/supabase/public-pairings";
import { loadPublicReleaseState } from "@/lib/data/supabase/public-programme";
import { pairingsSignature } from "@/lib/public/pairings-live";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/** The published pairings version, shared by the legacy endpoint and `/api/v1`. */
export interface PairingsVersion {
  signature: string;
  published: boolean;
  version: number | null;
  at: string | null;
}

export class PairingsVersionUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairingsVersionUnavailable";
  }
}

/**
 * One read of the frozen publication. The page and both endpoints use the same loader, so a
 * publish cannot mean one thing to the page and another to the version poll.
 */
export async function readPairingsVersion(): Promise<PairingsVersion> {
  if (!isSupabaseConfigured()) {
    throw new PairingsVersionUnavailable("Supabase is not configured.");
  }
  const client = createSupabasePublicClient();
  const [data, release] = await Promise.all([
    loadPublicPairings(client),
    loadPublicReleaseState(client).catch(() => null),
  ]);
  const published = data?.published ?? null;
  return {
    signature: pairingsSignature(published, release),
    published: published !== null,
    version: published?.version ?? null,
    at: published?.at ?? null,
  };
}

/** Shared caching absorbs the polling: about one database read per 10 seconds per edge. */
export const PAIRINGS_VERSION_CACHE = "public, s-maxage=10, stale-while-revalidate=20";
export const PAIRINGS_VERSION_NO_STORE = "no-store";

/** A weak ETag is enough: two responses with the same signature are interchangeable. */
export function pairingsVersionEtag(value: PairingsVersion): string {
  return `W/"${encodeURIComponent(value.signature)}"`;
}

/** `If-None-Match` may hold a list, or `*`. */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((part) => {
    const candidate = part.trim();
    return candidate === "*" || candidate === etag;
  });
}
