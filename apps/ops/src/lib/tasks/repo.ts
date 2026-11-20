import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

/**
 * Tasks repository. TASKS owns this file from here: fill in the interface, the Supabase
 * implementation and the in-memory demo implementation. Nothing below is real logic yet.
 */
export interface TasksRepo {}

export function createSupabaseTasksRepo(_client: SupabaseClient<Database>): TasksRepo {
  return {};
}

export function createDemoTasksRepo(): TasksRepo {
  return {};
}
