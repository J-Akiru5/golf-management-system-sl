import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getDeskMember } from "@/lib/auth/member";
import type { Database } from "@/lib/supabase/types";

function carryCookies(source: NextResponse, destination: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) destination.cookies.set(cookie);
  return destination;
}

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
  const client = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const isAuthHandler = pathname.startsWith("/auth/");
  const isPublicPairings = pathname === "/pairings";
  const { data, error } = await client.auth.getUser();

  if (isPublicPairings || isAuthHandler) return response;
  if (isLogin && (!data.user || error)) return response;

  if (!data.user || error) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    loginUrl.searchParams.set("error", "sign_in_required");
    return carryCookies(response, NextResponse.redirect(loginUrl));
  }

  try {
    await getDeskMember(client, data.user.id);
  } catch {
    if (isLogin) return response;
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "membership_required");
    return carryCookies(response, NextResponse.redirect(loginUrl));
  }

  if (isLogin) return carryCookies(response, NextResponse.redirect(new URL("/", request.url)));
  return response;
}

export const config = {
  matcher: [
    "/",
    "/players/:path*",
    "/import/:path*",
    "/draw/:path*",
    "/setup/:path*",
    "/course/:path*",
    "/spotlight/:path*",
    "/pairings",
    "/login",
    "/auth/:path*",
  ],
};
