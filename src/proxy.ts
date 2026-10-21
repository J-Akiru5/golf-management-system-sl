import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { authCookieOptions, REMEMBER_COOKIE, rememberPreference } from "@/lib/auth/cookies";
import { decide, type Identity } from "@/lib/auth/routes";
import { currentPlayerId } from "@/lib/player/portal";
import type { Database } from "@/lib/supabase/types";

function carryCookies(source: NextResponse, destination: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) destination.cookies.set(cookie);
  return destination;
}

/**
 * The sign-in guard. It runs only for the paths in PROXY_MATCHER, so the public pages (marketing,
 * pairings, the entry form) never pay for a session lookup.
 *
 * It resolves who is asking once, then hands the decision to `decide()` in `src/lib/auth/routes.ts`,
 * which is where the route rules live and are tested. No Supabase URL means demo mode: everything
 * is open and the shell says so.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return NextResponse.next();

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required when Supabase is configured." },
      { status: 500 },
    );
  }

  let response = NextResponse.next({ request });
  const remembered = rememberPreference(request.cookies.get(REMEMBER_COOKIE)?.value);
  const client = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, authCookieOptions(options ?? {}, remembered));
        }
      },
    },
  });

  const pathname = request.nextUrl.pathname;

  // The auth handler finishes the email link itself; it must not be guarded or redirected.
  if (pathname.startsWith("/auth/")) return response;

  const { data, error } = await client.auth.getUser();
  const user = error ? null : data.user;

  let identity: Identity = "signed-out";
  if (user) {
    identity = "unlinked";

    // Any membership row means staff. The desk's own loader reports the finer problems (several
    // clubs, an unknown role) with a real message, which is better than guessing here.
    const { data: membership, error: memberError } = await client
      .from("club_members")
      .select("role")
      .eq("user_id", user.id)
      .limit(2);

    if (!memberError && (membership?.length ?? 0) > 0) {
      identity = "staff";
    } else {
      try {
        if (await currentPlayerId(client)) identity = "player";
      } catch {
        // Before the player portal migration is applied this simply is not a player account.
      }
    }
  }

  const decision = decide({
    pathname,
    search: request.nextUrl.search,
    next: request.nextUrl.searchParams.get("next"),
    identity,
  });

  if (decision.type === "allow") return response;
  return carryCookies(response, NextResponse.redirect(new URL(decision.to, request.url)));
}

export const config = {
  // Next.js parses this statically, so it cannot be imported. It must stay identical to
  // PROXY_MATCHER in src/lib/auth/routes.ts, which routes.test.ts checks.
  matcher: [
    "/login",
    "/auth/:path*",
    "/my/:path*",
    "/admin/:path*",
    "/tournaments/:path*",
    "/register/:path*",
    "/players/:path*",
    "/import/:path*",
    "/draw/:path*",
    "/scores/:path*",
    "/print/:path*",
    "/setup/:path*",
    "/course/:path*",
    "/spotlight/:path*",
  ],
};
