import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Documents repository. DOCS owns this file from here: fill in the interface, the Supabase
 * implementation and the in-memory demo implementation. Nothing below is real logic yet.
 */
export interface DocsRepo {}

export function createSupabaseDocsRepo(_client: SupabaseClient<Database>): DocsRepo {
  return {};
}

export function createDemoDocsRepo(): DocsRepo {
  return {};
}
