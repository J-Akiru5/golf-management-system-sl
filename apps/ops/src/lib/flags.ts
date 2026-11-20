import { type WorkspaceEnv, workspaceEnv } from "./env";

/**
 * Is the workspace app switched on? Only the exact value "1" turns it on, so a stray "true" or a
 * half-typed value leaves every route as a 404 rather than opening the door.
 */
export function opsEnabled(env: WorkspaceEnv = workspaceEnv): boolean {
  return env.OPS_ENABLED === "1";
}

/**
 * Demo mode runs the app on in-memory data with no database. All three conditions must hold:
 * OPS_DEMO is exactly "1", the build is not a production build, and no Supabase URL is set.
 * A production build can therefore never run on demo data, whatever the environment says.
 */
export function demoMode(env: WorkspaceEnv = workspaceEnv): boolean {
  if (env.OPS_DEMO !== "1") return false;
  if (env.NODE_ENV === "production") return false;
  return (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() === "";
}
