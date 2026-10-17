import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseEnvironment } from "./env";
import type { Database } from "./types";

export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const environment = getSupabaseEnvironment();
  if (!environment) throw new Error("Supabase is not configured.");

  const cookieStore = await cookies();
  return createServerClient<Database>(environment.url, environment.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can read cookies but cannot write them. Proxy refreshes the session.
        }
      },
    },
  });
}
