import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Pipeline board repository. BOARD owns this file from here: fill in the interface, the Supabase
 * implementation and the in-memory demo implementation. Nothing below is real logic yet.
 */
export interface BoardRepo {}

export function createSupabaseBoardRepo(_client: SupabaseClient<Database>): BoardRepo {
  return {};
}

export function createDemoBoardRepo(): BoardRepo {
  return {};
}
