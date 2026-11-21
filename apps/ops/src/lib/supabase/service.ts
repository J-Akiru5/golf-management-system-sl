import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The server-only service-role client.
 *
 * This key bypasses row level security, so it is read from the server environment only and this
 * module is imported exclusively by server actions after the caller has been confirmed as an
 * active workspace owner. It is never a NEXT_PUBLIC_ value, never a client component import and
 * never written to a page, a log or a commit.
 *
 * Two names are accepted because the project already uses SUPABASE_SERVICE_ROLE_KEY in scripts.
 * If neither is set, the invite and tabulator controls are disabled with a plain message; every
 * other Admin action goes through the owner-gated database functions and keeps working.
 */
export type ServiceRoleSettings = { url: string; key: string };

type ServiceEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  SUPABASE_SECRET_ROLE_KEY?: string | undefined;
};

function readEnv(env: ServiceEnv): ServiceEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SECRET_ROLE_KEY: env.SUPABASE_SECRET_ROLE_KEY,
  };
}

/** The URL and a service-role key, or null when either is missing. Half a pair is null. */
export function serviceRoleSettings(
  env: ServiceEnv = process.env as ServiceEnv,
): ServiceRoleSettings | null {
  const read = readEnv(env);
  const url = (read.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (read.SUPABASE_SERVICE_ROLE_KEY ?? read.SUPABASE_SECRET_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return { url, key };
}

/** Whether the invite and tabulator controls can be offered on this deployment. */
export function serviceRoleAvailable(env: ServiceEnv = process.env as ServiceEnv): boolean {
  return serviceRoleSettings(env) !== null;
}

/**
 * The service-role client, or null when the key is absent. Callers must check for null and show
 * "Needs the service-role key on this project" rather than failing the whole page.
 */
export function getServiceRoleSupabase(
  env: ServiceEnv = process.env as ServiceEnv,
): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("The service-role client is server only.");
  }

  const settings = serviceRoleSettings(env);
  if (!settings) return null;

  return createClient(settings.url, settings.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
