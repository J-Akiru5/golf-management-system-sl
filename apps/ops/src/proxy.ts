import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/db/types";
import { supabaseSettings } from "@/lib/env";
import { opsEnabled } from "@/lib/flags";

/**
 * Two jobs only, no redirects.
 *
 * 1. With OPS_ENABLED unset, every route answers 404.
 * 2. Otherwise refresh the Supabase session cookie, so a Server Component always sees a fresh
 *    session. The membership gate lives in src/app/(app)/layout.tsx.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!opsEnabled()) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // No Supabase configuration means demo mode or a misconfiguration. Either way there is no
  // session to refresh, and the layout fails closed.
  const settings = supabaseSettings();
  if (!settings) return NextResponse.next();

  let response = NextResponse.next({ request });
  const client = createServerClient<Database>(settings.url, settings.anonKey, {
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

  // The call is the point: it refreshes an expiring session and writes the new cookie.
  await client.auth.getUser();
  return response;
}

export const config = {
  // Every page, but not static files. A 404 for the app must not stop the browser loading the
  // stylesheet or an SVG from /brand.
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico).*)"],
};
