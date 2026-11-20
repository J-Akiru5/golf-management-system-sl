import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Members repository. SETTINGS owns this file from here: fill in the interface, the Supabase
 * implementation and the in-memory demo implementation. Nothing below is real logic yet.
 */
export interface MembersRepo {}

export function createSupabaseMembersRepo(_client: SupabaseClient<Database>): MembersRepo {
  return {};
}

export function createDemoMembersRepo(): MembersRepo {
  return {};
}
