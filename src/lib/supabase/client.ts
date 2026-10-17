import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "./env";
import type { Database } from "./types";

export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  const environment = getSupabaseEnvironment();
  if (!environment) throw new Error("Supabase is not configured.");

  return createBrowserClient<Database>(environment.url, environment.anonKey);
}
