"use server";

import { revalidatePath } from "next/cache";
import { type AccessLevel, isAccessLevel, isPageId, isWorkspaceRole } from "@/lib/access/pages";
import { type AccessClient, createAccessGateway } from "@/lib/access/repo";
import type { AccessActionResult, MatrixResult } from "@/lib/access/types";
import { adminErrorMessage, requireOwner } from "@/lib/admin/gate";
import type { WorkspaceRole } from "@/lib/db/types";

/**
 * The Permissions screen's server actions. Each one starts with `requireOwner`, the same gate the
 * rest of Admin uses, and the database functions repeat it. The function names here are the only
 * place the RPCs are chosen.
 */

const MIN_REASON = 5;
const OWNER_FIXED = "The owner keeps edit on every page.";

function reasonProblem(reason: string): string | null {
  return reason.trim().length < MIN_REASON
    ? `Give a reason of at least ${MIN_REASON} characters. It is recorded in the audit log.`
    : null;
}

function gatewayFor(client: AccessClient) {
  return createAccessGateway(client);
}

function revalidatePermissions(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/permissions");
}

export async function loadPermissionsAction(): Promise<MatrixResult> {
  try {
    const client = await requireOwner();
    return { ok: true, matrix: await gatewayFor(client as unknown as AccessClient).matrix() };
  } catch (error) {
    return { ok: false, message: adminErrorMessage(error) };
  }
}

export async function setRolePermissionAction(
  role: WorkspaceRole,
  page: string,
  level: AccessLevel,
  reason: string,
): Promise<AccessActionResult> {
  try {
    const client = await requireOwner();

    if (!isWorkspaceRole(role)) return { ok: false, message: "Choose a role." };
    if (!isPageId(page)) return { ok: false, message: "Choose a page." };
    if (!isAccessLevel(level)) return { ok: false, message: "Choose an access level." };
    if (role === "owner" && level !== "edit") return { ok: false, message: OWNER_FIXED };

    const problem = reasonProblem(reason);
    if (problem) return { ok: false, message: problem };

    await gatewayFor(client as unknown as AccessClient).setRolePermission(
      role,
      page,
      level,
      reason,
    );
    revalidatePermissions();
    return { ok: true, message: "Role permissions saved." };
  } catch (error) {
    return { ok: false, message: adminErrorMessage(error) };
  }
}

/** A null level clears the override and puts the person back on their role default. */
export async function setUserPermissionAction(
  userId: string,
  page: string,
  level: AccessLevel | null,
  reason: string,
): Promise<AccessActionResult> {
  try {
    const client = await requireOwner();

    const id = typeof userId === "string" ? userId.trim() : "";
    if (id.length === 0) return { ok: false, message: "Choose a person." };
    if (!isPageId(page)) return { ok: false, message: "Choose a page." };
    if (level !== null && !isAccessLevel(level)) {
      return { ok: false, message: "Choose an access level." };
    }

    const problem = reasonProblem(reason);
    if (problem) return { ok: false, message: problem };

    await gatewayFor(client as unknown as AccessClient).setUserPermission(id, page, level, reason);
    revalidatePermissions();
    return {
      ok: true,
      message: level === null ? "Back on the role default." : "Access saved.",
    };
  } catch (error) {
    return { ok: false, message: adminErrorMessage(error) };
  }
}
