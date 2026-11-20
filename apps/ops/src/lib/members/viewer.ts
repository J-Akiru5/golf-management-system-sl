import type { WorkspaceRole } from "@/lib/db/types";
import { demoMode } from "@/lib/flags";
import { getRepos } from "@/lib/repos";
import { createDemoMembersRepo, type MembersRepo } from "./repo";

/**
 * `?as=member` chooses which demo member is looking at the page. Demo mode is the only place the
 * value is read; everywhere else the signed-in session decides and the database enforces the rules.
 * Anything unrecognised is the demo owner, so a stray value cannot open a page that is not there.
 */
export function parseDemoViewer(value: string | string[] | undefined): WorkspaceRole {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "owner" || raw === "partner" || raw === "member") return raw;
  return "owner";
}

/** The members repository for a page or an action. */
export async function settingsMembersRepo(demoViewer: WorkspaceRole): Promise<MembersRepo> {
  if (demoMode()) return createDemoMembersRepo(demoViewer);
  return (await getRepos()).members;
}
