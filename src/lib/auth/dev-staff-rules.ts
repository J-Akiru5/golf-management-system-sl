import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * The local development desk account.
 *
 * It exists so a developer can walk through the staff sign-in and the desk on `next dev` without a
 * Supabase project. It is not a club account, it is not created in any database, and it is off in a
 * production build and whenever a real project is configured. See docs/STAFF_ACCESS.md.
 */
export const DEV_STAFF_EMAIL = "staff@gmail.com";

/** A sample password the app's own validator rates Strong. It is not a club credential. */
export const DEV_STAFF_PASSWORD = "TeeLine-Desk-Dev-2026!";

/**
 * Development only, and only while no Supabase project is configured. `next build` and `next start`
 * run with NODE_ENV=production, so the branch cannot open in a production build. A configured
 * project takes over auth, so the branch closes there too.
 */
export function devStaffLoginEnabled({
  nodeEnv = process.env.NODE_ENV,
  supabaseConfigured = isSupabaseConfigured(),
}: {
  nodeEnv?: string | undefined;
  supabaseConfigured?: boolean;
} = {}): boolean {
  return nodeEnv === "development" && !supabaseConfigured;
}

export function isDevStaffCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEV_STAFF_EMAIL && password === DEV_STAFF_PASSWORD;
}
