"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceMemberStatus, WorkspaceRole } from "@/lib/db/types";
import { type ActionResult, mapMemberError } from "@/lib/members/errors";
import { checkDisplayName, isWorkspaceRole } from "@/lib/members/rules";
import { settingsMembersRepo } from "@/lib/members/viewer";

function revalidateMembers(): void {
  revalidatePath("/settings/members");
  revalidatePath("/settings");
}

/**
 * Adds an existing Supabase account to the workspace. `demoViewer` is bound in by the page and is
 * only read in demo mode; with a real session the database function checks that the caller is an
 * owner and looks the email up in auth.users itself.
 */
export async function addMemberAction(
  demoViewer: WorkspaceRole,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const roleValue = String(formData.get("role") ?? "");

  if (!email) {
    return { ok: false, message: "Enter the email address of an account that already exists." };
  }
  const nameProblem = checkDisplayName(displayName);
  if (nameProblem) return { ok: false, message: nameProblem };
  if (!isWorkspaceRole(roleValue)) return { ok: false, message: "Choose a role." };

  try {
    const repo = await settingsMembersRepo(demoViewer);
    await repo.addMember({ email, role: roleValue, displayName });
    revalidateMembers();
    return { ok: true, message: `Added ${email} to the workspace.` };
  } catch (error) {
    return { ok: false, message: mapMemberError(error) };
  }
}

export async function setMemberRoleAction(
  demoViewer: WorkspaceRole,
  userId: string,
  role: WorkspaceRole,
): Promise<ActionResult> {
  if (!isWorkspaceRole(role)) return { ok: false, message: "Choose a role." };

  try {
    const repo = await settingsMembersRepo(demoViewer);
    await repo.setRole(userId, role);
    revalidateMembers();
    return { ok: true, message: "Role saved." };
  } catch (error) {
    return { ok: false, message: mapMemberError(error) };
  }
}

export async function setMemberStatusAction(
  demoViewer: WorkspaceRole,
  userId: string,
  status: WorkspaceMemberStatus,
): Promise<ActionResult> {
  if (status !== "active" && status !== "suspended") {
    return { ok: false, message: "Choose a status." };
  }

  try {
    const repo = await settingsMembersRepo(demoViewer);
    await repo.setStatus(userId, status);
    revalidateMembers();
    return { ok: true, message: status === "suspended" ? "Suspended." : "Reactivated." };
  } catch (error) {
    return { ok: false, message: mapMemberError(error) };
  }
}

export async function removeMemberAction(
  demoViewer: WorkspaceRole,
  userId: string,
): Promise<ActionResult> {
  try {
    const repo = await settingsMembersRepo(demoViewer);
    await repo.removeMember(userId);
    revalidateMembers();
    return { ok: true, message: "Removed." };
  } catch (error) {
    return { ok: false, message: mapMemberError(error) };
  }
}
