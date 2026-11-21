"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/access/server";
import type { WorkspaceRole } from "@/lib/db/types";
import { type ActionResult, mapMemberError } from "@/lib/members/errors";
import { checkDisplayName } from "@/lib/members/rules";
import { settingsMembersRepo } from "@/lib/members/viewer";

/**
 * Saves the signed-in person's display name. The demo viewer is bound in when demo mode is on;
 * otherwise the repository runs as the caller's real session and the database enforces the rule.
 */
export async function updateDisplayNameAction(
  demoViewer: WorkspaceRole,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("displayName") ?? "").trim();
  const problem = checkDisplayName(name);
  if (problem) return { ok: false, message: problem };

  try {
    await requireAccess("settings.profile", "edit");
    const repo = await settingsMembersRepo(demoViewer);
    await repo.updateMyDisplayName(name);
    revalidatePath("/settings");
    revalidatePath("/settings/members");
    return { ok: true, message: "Saved." };
  } catch (error) {
    return { ok: false, message: mapMemberError(error) };
  }
}
