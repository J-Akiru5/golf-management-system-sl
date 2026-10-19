import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { authCookieOptions, REMEMBER_COOKIE, rememberPreference } from "@/lib/auth/cookies";
import { getSupabaseEnvironment } from "./env";
import type { Database } from "./types";

/**
 * `remembered` overrides the stored preference. Sign-in passes it explicitly because the preference
 * cookie is written in the same action, and a request's cookie store does not have to show that
 * write back to the code that made it.
 */
export async function createSupabaseServerClient(preference?: {
  remembered?: boolean | null;
}): Promise<SupabaseClient<Database>> {
  const environment = getSupabaseEnvironment();
  if (!environment) throw new Error("Supabase is not configured.");

  const cookieStore = await cookies();
  const remembered =
    preference && "remembered" in preference
      ? (preference.remembered ?? null)
      : rememberPreference(cookieStore.get(REMEMBER_COOKIE)?.value);
  return createServerClient<Database>(environment.url, environment.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, authCookieOptions(options ?? {}, remembered));
          }
        } catch {
          // Server Components can read cookies but cannot write them. Proxy refreshes the session.
        }
      },
    },
  });
}
