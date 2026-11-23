import { createClient } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_DATA_TAG, readPublicLiveSignature } from "@/lib/data/supabase/public-cache";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

/**
 * The public pages are rendered per request but their data is cached. This route owns both sides of
 * that cache:
 *
 *   - **GET** answers the live signature: the published pairings version, the release keys and the
 *     published rounds, as one short string. An open public page polls it while the tab is visible
 *     and reloads only when it has moved, so a publish reaches a phone without a manual refresh and
 *     without a per-visitor database read. It is public and cacheable at the edge for a few seconds.
 *   - **POST** is the desk's clear after a publish, an unpublish or a release toggle. The caller
 *     proves who they are with their Supabase access token and must be an owner or organizer;
 *     anyone else gets a 403 and nothing is revalidated.
 */

/** A few seconds at the edge absorbs a field of phones; a publish is still visible within one poll. */
const LIVE_SIGNATURE_CACHE = "public, s-maxage=5, must-revalidate";

/** Never prerender the signature at build time: it must describe the database now. */
export const dynamic = "force-dynamic";

/** The live signature the public pages poll. Never a player's data: versions, times and flags. */
export async function GET() {
  if (!getSupabaseEnvironment()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const signature = await readPublicLiveSignature();
    return Response.json({ signature }, { headers: { "Cache-Control": LIVE_SIGNATURE_CACHE } });
  } catch {
    return Response.json(
      { error: "The published results could not be read." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  const environment = getSupabaseEnvironment();
  if (!environment) return Response.json({ error: "Supabase is not configured." }, { status: 404 });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return Response.json({ error: "Sign in required." }, { status: 401 });

  const client = createClient<Database>(environment.url, environment.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data: member } = await client
    .from("club_members")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", ["owner", "organizer"])
    .limit(1)
    .maybeSingle();
  if (!member) return Response.json({ error: "Not allowed." }, { status: 403 });

  revalidatePath("/pairings");
  // The public pages share the published reads through a short cache. A publish is the moment
  // that cache is wrong, so it is cleared here rather than waited out.
  revalidateTag(PUBLIC_DATA_TAG, "max");
  return Response.json({ ok: true });
}
