/**
 * The environment this app reads, in one place.
 *
 * `workspaceEnv` reads each variable by name so Next can inline the NEXT_PUBLIC_ values into the
 * browser bundle. Nothing here is a secret: the anon key is public by design and row level security
 * is the protection. This app never holds a service-role key.
 */
export type WorkspaceEnv = {
  OPS_ENABLED?: string | undefined;
  OPS_DEMO?: string | undefined;
  NODE_ENV?: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string | undefined;
};

export const workspaceEnv: WorkspaceEnv = {
  OPS_ENABLED: process.env.OPS_ENABLED,
  OPS_DEMO: process.env.OPS_DEMO,
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

export type SupabaseSettings = { url: string; anonKey: string };

/** Both Supabase values, or null when neither is set. Half a configuration is an error. */
export function supabaseSettings(env: WorkspaceEnv = workspaceEnv): SupabaseSettings | null {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  if (!url && !anonKey) return null;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is only half configured. Set both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or neither.",
    );
  }
  return { url, anonKey };
}
