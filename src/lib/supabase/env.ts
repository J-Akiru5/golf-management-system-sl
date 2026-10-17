export interface SupabaseEnvironment {
  url: string;
  anonKey: string;
}

/** No URL means intentional demo mode. A partially configured Supabase app is an error. */
export function getSupabaseEnvironment(): SupabaseEnvironment | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required when Supabase is configured.");
  }

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
}
