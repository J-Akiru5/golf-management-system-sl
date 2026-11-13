import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { REMEMBER_COOKIE } from "@/lib/auth/cookies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ends the session from a page that cannot call a server action.
 *
 * The scorecard editor is a static HTML page, so its sign-out is a plain form post to this route
 * instead of the `signOut` action the React shells use. Signing out is the only thing this route
 * does, and it always ends on the sign-in page, so a request with a stale or missing session is
 * harmless.
 */
async function endSession(request: NextRequest): Promise<NextResponse> {
  try {
    const client = await createSupabaseServerClient();
    await client.auth.signOut();
  } catch {
    // Supabase may already be unreachable or the session already gone; the cookies still go.
  }
  try {
    const store = await cookies();
    store.delete(REMEMBER_COOKIE);
  } catch {
    // Outside a request that can write cookies the browser is sent to the sign-in page anyway.
  }
  return NextResponse.redirect(new URL("/login?message=signed_out", request.url), { status: 303 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return endSession(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return endSession(request);
}
