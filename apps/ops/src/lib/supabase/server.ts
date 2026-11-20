import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/types";
import { supabaseSettings } from "@/lib/env";

/**
 * The server client. It carries the caller's session from the cookies the proxy keeps fresh, so
 * every query runs as the signed-in member and row level security applies.
 */
export async function getServerSupabase(): Promise<SupabaseClient<Database>> {
  const settings = supabaseSettings();
  if (!settings) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or run a development build with OPS_DEMO=1.",
    );
  }

  const store = await cookies();
  return createServerClient<Database>(settings.url, settings.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options);
        } catch {
          // A Server Component cannot set cookies. The proxy already refreshed the session, so
          // there is nothing to write here.
        }
      },
    },
  });
}
