/**
 * Tasks repository. The contract and its shared types live in `./types`, the Supabase
 * implementation in `./supabase` and the in-memory demo implementation in `./demo`. This file is
 * the one place the rest of the app imports from.
 *
 * RLS does the access control. The repository does not take a role: it runs as the caller.
 */
export { createDemoTasksRepo, resetDemoTasksStore } from "./demo";
export { createSupabaseTasksRepo } from "./supabase";
export type {
  ActionResult,
  TaskActions,
  TaskCardOption,
  TaskDraft,
  TaskMember,
  TaskPatch,
  TasksRepo,
  TaskViewer,
} from "./types";
