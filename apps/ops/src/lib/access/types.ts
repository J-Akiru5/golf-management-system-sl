import type { WorkspaceRole } from "@/lib/db/types";
import type { AccessLevel } from "./pages";

/**
 * The shapes the Admin permissions screens use. Pure types only, so a client component can import
 * them without pulling in the server or the database.
 */

/** One cell of the role matrix. */
export type RolePermission = {
  role: WorkspaceRole;
  page: string;
  level: AccessLevel;
};

/** One override for one person. */
export type UserPermission = {
  userId: string;
  page: string;
  level: AccessLevel;
};

/** What `ws_permission_matrix()` returns. */
export type PermissionMatrix = {
  roles: RolePermission[];
  overrides: UserPermission[];
};

export type MatrixResult = { ok: true; matrix: PermissionMatrix } | { ok: false; message: string };

export type AccessActionResult = { ok: boolean; message: string };
