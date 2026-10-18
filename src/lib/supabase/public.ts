import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "./env";
import type { Database } from "./types";

/**
 * An anonymous client for public pages: no cookies, no session, no refresh. Pages built with it
 * can be cached and served from the edge, and can only call what the anon role may call
 * (`public_pairings`, `public_registration_form`, `submit_registration`).
 */
export function createSupabasePublicClient(): SupabaseClient<Database> {
  const environment = getSupabaseEnvironment();
  if (!environment) throw new Error("Supabase is not configured.");
  return createClient<Database>(environment.url, environment.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
