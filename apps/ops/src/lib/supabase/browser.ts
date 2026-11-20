"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { supabaseSettings } from "@/lib/env";

let cached: SupabaseClient<Database> | null = null;

/**
 * The browser client, for client components. The anon key is public by design; row level security
 * decides what the session may read or write.
 */
export function getBrowserSupabase(): SupabaseClient<Database> {
  if (cached) return cached;

  const settings = supabaseSettings();
  if (!settings) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or run a development build with OPS_DEMO=1.",
    );
  }

  cached = createBrowserClient<Database>(settings.url, settings.anonKey);
  return cached;
}
