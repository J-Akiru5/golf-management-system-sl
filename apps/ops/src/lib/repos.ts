import type { BoardRepo } from "@/lib/board/repo";
import { createDemoBoardRepo, createSupabaseBoardRepo } from "@/lib/board/repo";
import type { DocsRepo } from "@/lib/docs/repo";
import { createDemoDocsRepo, createSupabaseDocsRepo } from "@/lib/docs/repo";
import { supabaseSettings, type WorkspaceEnv, workspaceEnv } from "@/lib/env";
import { demoMode } from "@/lib/flags";
import type { MembersRepo } from "@/lib/members/repo";
import { createDemoMembersRepo, createSupabaseMembersRepo } from "@/lib/members/repo";
import { getServerSupabase } from "@/lib/supabase/server";
import type { TasksRepo } from "@/lib/tasks/repo";
import { createDemoTasksRepo, createSupabaseTasksRepo } from "@/lib/tasks/repo";

export type Repos = {
  docs: DocsRepo;
  board: BoardRepo;
  tasks: TasksRepo;
  members: MembersRepo;
};

/** The demo set. Only reachable in a development build with no Supabase URL. */
export function createDemoRepos(): Repos {
  return {
    docs: createDemoDocsRepo(),
    board: createDemoBoardRepo(),
    tasks: createDemoTasksRepo(),
    members: createDemoMembersRepo(),
  };
}

/**
 * The repository set for this request.
 *
 * Demo data only when `demoMode()` says so. Otherwise the Supabase set, run as the caller's
 * session. With no Supabase configuration and demo off, this throws: the app fails closed rather
 * than showing an empty board that looks like real data.
 */
export async function getRepos(env: WorkspaceEnv = workspaceEnv): Promise<Repos> {
  if (demoMode(env)) return createDemoRepos();

  const settings = supabaseSettings(env);
  if (!settings) {
    throw new Error(
      "The workspace app has no data source. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or run a development build with OPS_DEMO=1.",
    );
  }

  const client = await getServerSupabase();
  return {
    docs: createSupabaseDocsRepo(client),
    board: createSupabaseBoardRepo(client),
    tasks: createSupabaseTasksRepo(client),
    members: createSupabaseMembersRepo(client),
  };
}
