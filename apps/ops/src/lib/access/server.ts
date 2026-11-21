import { cache } from "react";
import { adminErrorMessage } from "@/lib/admin/gate";
import { getViewer } from "@/lib/auth/viewer";
import type { WorkspaceRole } from "@/lib/db/types";
import { demoMode } from "@/lib/flags";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  type AccessLevel,
  type AccessMap,
  levelAtLeast,
  levelFor,
  mergeWithDefaults,
  type PageId,
  roleAccess,
} from "./pages";
import { type AccessClient, createAccessGateway } from "./repo";
import type { MatrixResult } from "./types";

/**
 * The server's view of what the signed-in person may open. Three callers share it: the shell builds
 * its menu, each page asks the guard, and each server action asks before it writes.
 */

export const NO_PAGE_ACCESS = "You do not have access to that page.";
export const VIEW_ONLY_ACCESS = "You have view-only access to that page.";

export class PageAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageAccessError";
  }
}

async function sessionGateway(): Promise<ReturnType<typeof createAccessGateway>> {
  const client = await getServerSupabase();
  return createAccessGateway(client as unknown as AccessClient);
}

/**
 * What this role may open.
 *
 * If the permission tables have not been applied yet, or the read fails for any other reason, the
 * answer is the role defaults. That is today's behaviour, so nothing locks anyone out before the
 * owner runs the SQL.
 */
export async function loadAccess(role: WorkspaceRole): Promise<Record<string, AccessLevel>> {
  if (demoMode()) return roleAccess("owner");

  try {
    const rows = await (await sessionGateway()).myAccess();
    return mergeWithDefaults(role, rows);
  } catch {
    return roleAccess(role);
  }
}

/**
 * The signed-in person's access for this request, read once and shared. A person with no active
 * member row gets nothing.
 */
export const currentAccess = cache(async (): Promise<AccessMap> => {
  if (demoMode()) return roleAccess("owner");

  const viewer = await getViewer();
  if (!viewer?.member || viewer.member.status !== "active") return {};

  return loadAccess(viewer.member.role);
});

/** Throws a message that is safe to show when the person may not do this. */
export async function requireAccess(page: PageId, level: AccessLevel = "view"): Promise<void> {
  const actual = levelFor(await currentAccess(), page);
  if (levelAtLeast(actual, level)) return;
  throw new PageAccessError(actual === "none" ? NO_PAGE_ACCESS : VIEW_ONLY_ACCESS);
}

/** The role matrix and every override. Owner only, enforced by the database function too. */
export async function loadPermissionMatrix(): Promise<MatrixResult> {
  try {
    const matrix = await (await sessionGateway()).matrix();
    return { ok: true, matrix };
  } catch (error) {
    return { ok: false, message: adminErrorMessage(error) };
  }
}
