import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { getServerSupabase } from "@/lib/supabase/server";
import { OWNER_ONLY_MESSAGE } from "./rules";

/**
 * The owner gate. Every Admin server action calls this first, through the caller's own session, so
 * the database function `ws_has_role` decides. The service-role client is only built after this
 * returns, and the god_* functions repeat the same check.
 */

export const NOT_CONFIGURED_MESSAGE =
  "The workspace database is not configured, so Admin cannot load.";

export class AdminError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AdminError";
    this.code = code;
  }
}

export type SessionClient = SupabaseClient<Database>;

export async function requireOwner(): Promise<SessionClient> {
  let client: SessionClient;
  try {
    client = await getServerSupabase();
  } catch {
    throw new AdminError("config", NOT_CONFIGURED_MESSAGE);
  }

  const { data, error } = await client.rpc("ws_has_role", { p_roles: ["owner"] });
  if (error) {
    throw new AdminError(error.code ?? "unknown", error.message || NOT_CONFIGURED_MESSAGE);
  }
  if (data !== true) {
    throw new AdminError("42501", OWNER_ONLY_MESSAGE);
  }

  return client;
}

function isErrorShape(value: unknown): value is { code?: unknown; message?: unknown } {
  return typeof value === "object" && value !== null;
}

/** A message safe to show: our own words, never a stack trace or a connection string. */
export function adminErrorMessage(error: unknown): string {
  if (error instanceof AdminError) return error.message;

  if (isErrorShape(error)) {
    const code = typeof error.code === "string" ? error.code : null;
    if (code === "42501") return OWNER_ONLY_MESSAGE;
    const message = typeof error.message === "string" ? error.message.trim() : "";
    if (message) return message;
  }

  return "Something went wrong. Try again.";
}
