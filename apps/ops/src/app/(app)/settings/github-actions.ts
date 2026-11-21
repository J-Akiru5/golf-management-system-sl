"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/access/server";
import type { WorkspaceRole } from "@/lib/db/types";
import { demoMode } from "@/lib/flags";
import { createGithubClient } from "@/lib/github/client";
import { githubRepository, githubToken } from "@/lib/github/config";
import { serverGithubRepo, serviceGithubRepo } from "@/lib/github/repo";
import { normaliseLogin } from "@/lib/github/rules";
import { safeError } from "@/lib/github/sync";
import { settingsMembersRepo } from "@/lib/members/viewer";

/**
 * The owner's GitHub actions: map a login to a member, remove a mapping, and import the open issues
 * the first time.
 *
 * Every action checks that the caller is an active owner before doing anything. The import runs with
 * the service role because it writes rows the webhook writes, and it is only reachable after that
 * check. No action returns or logs the token or the webhook secret, and a missing one is a plain
 * sentence rather than a failure of the page.
 */

export type GithubActionResult = { ok: true; message: string } | { ok: false; message: string };

const OWNER_ONLY = "Only a workspace owner can manage the GitHub sync.";
const DEMO_OFF = "GitHub sync is off in demo mode, because there is no database to record it in.";
const TOKEN_MISSING = "GITHUB_TOKEN is not set on this workspace deployment.";
const SERVICE_MISSING = "SUPABASE_SERVICE_ROLE_KEY is not set on this workspace deployment.";

/** Ten pages of 100. More than that is a backlog to import in a second run. */
const MAX_PAGES = 10;

function revalidateSettings(): void {
  revalidatePath("/settings");
  revalidatePath("/tasks");
}

/** Null when the caller may manage the sync; a refusal sentence otherwise. */
async function ownerRefusal(demoViewer: WorkspaceRole): Promise<string | null> {
  if (demoMode()) return demoViewer === "owner" ? null : OWNER_ONLY;
  try {
    // The page check comes first, so a per-person override of `none` refuses before any work.
    await requireAccess("settings.profile", "edit");
  } catch (error) {
    return error instanceof Error && error.message.trim() !== "" ? error.message : OWNER_ONLY;
  }
  try {
    const me = await (await settingsMembersRepo(demoViewer)).getMe();
    if (!me || me.role !== "owner" || me.status !== "active") return OWNER_ONLY;
    return null;
  } catch {
    return "Your workspace role could not be checked. Try again.";
  }
}

export async function importOpenIssuesAction(
  demoViewer: WorkspaceRole,
): Promise<GithubActionResult> {
  const refusal = await ownerRefusal(demoViewer);
  if (refusal) return { ok: false, message: refusal };
  if (demoMode()) return { ok: false, message: DEMO_OFF };

  const token = githubToken();
  if (token === null) return { ok: false, message: TOKEN_MISSING };
  const repo = serviceGithubRepo();
  if (repo === null) return { ok: false, message: SERVICE_MISSING };

  const client = createGithubClient({ token, repository: githubRepository() });

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let rateLimited = false;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let list: Awaited<ReturnType<typeof client.listOpenIssues>>;
    try {
      list = await client.listOpenIssues(page, 100);
    } catch (error) {
      return {
        ok: false,
        message: `The import stopped on page ${page}: ${safeError(error)}`,
      };
    }

    for (const issue of list.issues) {
      try {
        const applied = await repo.applyIssue(issue, "inbound");
        if (applied.status === "created") created += 1;
        else if (applied.status === "skipped") unchanged += 1;
        else updated += 1;
      } catch {
        failed += 1;
      }
    }

    if (!list.hasMore) break;
    if (list.rateLimitRemaining !== null && list.rateLimitRemaining <= 1) {
      rateLimited = true;
      break;
    }
    if (page === MAX_PAGES) rateLimited = true;
  }

  revalidateSettings();

  const counts = `${created} new, ${updated} updated, ${unchanged} unchanged`;
  if (failed > 0) {
    return {
      ok: false,
      message: `The import finished with ${failed} issue${failed === 1 ? "" : "s"} failing. ${counts}. The details are in the sync log.`,
    };
  }
  if (rateLimited) {
    return {
      ok: true,
      message: `The import stopped at GitHub's rate limit after ${counts}. Run it again later to pick up the rest.`,
    };
  }
  return { ok: true, message: `Imported the open issues: ${counts}.` };
}

export async function saveGithubMappingAction(
  demoViewer: WorkspaceRole,
  _state: GithubActionResult,
  formData: FormData,
): Promise<GithubActionResult> {
  const refusal = await ownerRefusal(demoViewer);
  if (refusal) return { ok: false, message: refusal };
  if (demoMode()) return { ok: false, message: DEMO_OFF };

  const login = normaliseLogin(String(formData.get("login") ?? ""));
  if (login === null) {
    return {
      ok: false,
      message: "A GitHub login is letters, digits and hyphens, up to 39 of them.",
    };
  }
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (memberId === "") return { ok: false, message: "Choose the member that login belongs to." };

  try {
    const members = await (await settingsMembersRepo(demoViewer)).listMembers();
    if (!members.some((member) => member.userId === memberId)) {
      return { ok: false, message: "Choose a member from the workspace list." };
    }
    const repo = await serverGithubRepo();
    await repo.saveUserMap(login, memberId);
    revalidateSettings();
    return { ok: true, message: `${login} is now mapped to that member.` };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : "The mapping was not saved.",
    };
  }
}

export async function removeGithubMappingAction(
  demoViewer: WorkspaceRole,
  login: string,
): Promise<GithubActionResult> {
  const refusal = await ownerRefusal(demoViewer);
  if (refusal) return { ok: false, message: refusal };
  if (demoMode()) return { ok: false, message: DEMO_OFF };

  const normalised = normaliseLogin(login);
  if (normalised === null) return { ok: false, message: "That is not a GitHub login." };

  try {
    const repo = await serverGithubRepo();
    await repo.removeUserMap(normalised);
    revalidateSettings();
    return { ok: true, message: `${normalised} is no longer mapped.` };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : "The mapping was not removed.",
    };
  }
}
