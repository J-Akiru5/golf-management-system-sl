import { type AccessLevel, isAccessLevel, isPageId, isWorkspaceRole } from "./pages";
import type { PermissionMatrix, RolePermission, UserPermission } from "./types";

/**
 * The read and write calls the permissions screens make. One small interface, so the server actions
 * are easy to test and one place knows the RPC names. The client is the caller's own session client,
 * cast to the loose shape below because the ws_* functions are newer than the hand-written Database
 * type. The database does the authorising.
 */

type RpcError = { message: string; code?: string | null };
type RpcResponse = { data: unknown; error: RpcError | null };

export interface AccessClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>;
}

export type AccessRow = { page: string; level: AccessLevel };

export interface AccessGateway {
  /** The caller's effective level per page. */
  myAccess(): Promise<AccessRow[]>;
  /** Owner only: the role matrix and every override. */
  matrix(): Promise<PermissionMatrix>;
  setRolePermission(role: string, page: string, level: AccessLevel, reason: string): Promise<void>;
  /** A null level clears the override. */
  setUserPermission(
    userId: string,
    page: string,
    level: AccessLevel | null,
    reason: string,
  ): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** One ws_my_access() row. A row with an unknown level is dropped rather than guessed. */
export function mapAccessRow(value: unknown): AccessRow | null {
  if (!isRecord(value)) return null;
  const page = asString(value.page);
  if (page === null) return null;
  if (!isAccessLevel(value.level)) return null;
  return { page, level: value.level };
}

function mapRoleRow(value: unknown): RolePermission | null {
  if (!isRecord(value)) return null;
  const page = asString(value.page);
  if (page === null || !isAccessLevel(value.level) || !isWorkspaceRole(value.role)) return null;
  return { role: value.role, page, level: value.level };
}

function mapOverrideRow(value: unknown): UserPermission | null {
  if (!isRecord(value)) return null;
  const userId = asString(value.userId);
  const page = asString(value.page);
  if (userId === null || page === null || !isAccessLevel(value.level)) return null;
  return { userId, page, level: value.level };
}

/** The jsonb `ws_permission_matrix()` returns, to the shape the screens use. */
export function mapMatrix(value: unknown): PermissionMatrix {
  if (!isRecord(value)) return { roles: [], overrides: [] };

  const roles = Array.isArray(value.roles)
    ? value.roles.map(mapRoleRow).filter((row): row is RolePermission => row !== null)
    : [];
  const overrides = Array.isArray(value.overrides)
    ? value.overrides.map(mapOverrideRow).filter((row): row is UserPermission => row !== null)
    : [];

  return { roles, overrides };
}

/** Only pages the registry knows are shown, so a stray row cannot draw an empty column. */
export function knownOverrides(matrix: PermissionMatrix): UserPermission[] {
  return matrix.overrides.filter((row) => isPageId(row.page));
}

function rpcError(error: RpcError): Error {
  const wrapped = new Error(error.message) as Error & { code?: string };
  if (error.code) wrapped.code = error.code;
  return wrapped;
}

export function createAccessGateway(client: AccessClient): AccessGateway {
  async function call(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcError(error);
    return data;
  }

  const reasonArg = (reason: string): string => reason.trim();

  return {
    async myAccess() {
      const data = await call("ws_my_access");
      if (!Array.isArray(data)) return [];
      return data.map(mapAccessRow).filter((row): row is AccessRow => row !== null);
    },

    async matrix() {
      return mapMatrix(await call("ws_permission_matrix"));
    },

    async setRolePermission(role, page, level, reason) {
      await call("ws_set_role_permission", {
        p_role: role,
        p_page: page,
        p_level: level,
        p_reason: reasonArg(reason),
      });
    },

    async setUserPermission(userId, page, level, reason) {
      await call("ws_set_user_permission", {
        p_user: userId,
        p_page: page,
        p_level: level,
        p_reason: reasonArg(reason),
      });
    },
  };
}
