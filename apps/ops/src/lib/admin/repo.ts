import type { WorkspaceMemberStatus, WorkspaceRole } from "@/lib/db/types";
import { parseDeskAssignments } from "./snapshot";
import type {
  AdminClub,
  DeskRoleInput,
  GodAccount,
  GodApp,
  GodAuditEntry,
  WorkspaceRoleInput,
} from "./types";

/**
 * The read and write calls Admin makes. One small interface, so the server actions are easy to
 * test and there is one place that knows the RPC names.
 *
 * The client is the caller's session client, cast to the loose shape below because the god_*
 * functions are newer than the hand-written Database type. The database does the authorising.
 */

type RpcError = { message: string; code?: string | null };
type RpcResponse = { data: unknown; error: RpcError | null };

export interface AdminClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>;
}

export type AuditQuery = {
  limit?: number;
  before?: string | null;
  action?: string | null;
  target?: string | null;
};

export interface AdminGateway {
  listAccounts(): Promise<GodAccount[]>;
  listClubs(): Promise<AdminClub[]>;
  listAudit(query?: AuditQuery): Promise<GodAuditEntry[]>;
  setWorkspaceRole(userId: string, role: WorkspaceRoleInput, reason: string | null): Promise<void>;
  setDeskRole(
    userId: string,
    clubId: string,
    role: DeskRoleInput,
    reason: string | null,
  ): Promise<void>;
  suspend(userId: string, apps: GodApp[], reason: string): Promise<void>;
  restore(userId: string, reason: string | null): Promise<void>;
  signOutEverywhere(userId: string, reason: string | null): Promise<void>;
  record(
    target: string | null,
    action: string,
    details: Record<string, unknown>,
    reason: string | null,
  ): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asDate(value: unknown): string | null {
  const text = asString(value);
  return text === null ? null : text;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

const WORKSPACE_ROLES: ReadonlyArray<WorkspaceRole> = ["owner", "partner", "member"];

function asWorkspaceRole(value: unknown): WorkspaceRole | null {
  return typeof value === "string" && (WORKSPACE_ROLES as ReadonlyArray<string>).includes(value)
    ? (value as WorkspaceRole)
    : null;
}

function asMemberStatus(value: unknown): WorkspaceMemberStatus | null {
  return value === "active" || value === "suspended" ? value : null;
}

/**
 * One row of god_list_accounts() to the shape the screens use. A row without an id or a name is
 * dropped rather than filled in with a guess.
 */
export function mapAccountRow(value: unknown): GodAccount | null {
  if (!isRecord(value)) return null;

  const userId = asString(value.user_id);
  if (userId === null) return null;

  const displayName = asString(value.display_name) ?? asString(value.email) ?? "Account";

  return {
    userId,
    email: asString(value.email),
    displayName,
    accountCreatedAt: asDate(value.account_created_at) ?? new Date(0).toISOString(),
    lastSignInAt: asDate(value.last_sign_in_at),
    lastActiveAt: asDate(value.last_active_at),
    emailConfirmed: asBoolean(value.email_confirmed),
    invitedPending: asBoolean(value.invited_pending),
    banned: asBoolean(value.banned),
    workspaceRole: asWorkspaceRole(value.workspace_role),
    workspaceStatus: asMemberStatus(value.workspace_status),
    deskRoles: parseDeskAssignments(value.desk_roles),
    tabulator: asBoolean(value.tabulator),
    playerName: asString(value.player_name),
    suspended: asBoolean(value.suspended),
    suspendedAt: asDate(value.suspended_at),
    suspendedReason: asString(value.suspended_reason),
  };
}

export function mapAuditRow(value: unknown): GodAuditEntry | null {
  if (!isRecord(value)) return null;

  const id = Number(value.id);
  const at = asString(value.at);
  const action = asString(value.action);
  if (!Number.isFinite(id) || at === null || action === null) return null;

  return {
    id,
    at,
    actorId: asString(value.actor),
    actorEmail: asString(value.actor_email),
    targetId: asString(value.target),
    targetEmail: asString(value.target_email),
    action,
    details: isRecord(value.details) ? value.details : {},
    reason: asString(value.reason),
  };
}

function rpcError(error: RpcError): Error {
  const wrapped = new Error(error.message) as Error & { code?: string };
  if (error.code) wrapped.code = error.code;
  return wrapped;
}

export function createAdminGateway(client: AdminClient): AdminGateway {
  async function call(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcError(error);
    return data;
  }

  const reasonArg = (reason: string | null): string | null =>
    reason !== null && reason.trim().length > 0 ? reason.trim() : null;

  return {
    async listAccounts() {
      const data = await call("god_list_accounts");
      if (!Array.isArray(data)) return [];
      return data.map(mapAccountRow).filter((account): account is GodAccount => account !== null);
    },

    async listClubs() {
      const data = await call("god_list_clubs");
      if (!Array.isArray(data)) return [];
      return data
        .map((row): AdminClub | null => {
          if (!isRecord(row)) return null;
          const id = asString(row.id);
          const name = asString(row.name);
          return id !== null && name !== null ? { id, name } : null;
        })
        .filter((club): club is AdminClub => club !== null);
    },

    async listAudit(query = {}) {
      const data = await call("god_audit_list", {
        p_limit: query.limit ?? 200,
        p_before: query.before ?? null,
        p_action: query.action ?? null,
        p_target: query.target ?? null,
      });
      if (!Array.isArray(data)) return [];
      return data.map(mapAuditRow).filter((entry): entry is GodAuditEntry => entry !== null);
    },

    async setWorkspaceRole(userId, role, reason) {
      await call("god_set_workspace_role", {
        p_user: userId,
        p_role: role,
        p_reason: reasonArg(reason),
      });
    },

    async setDeskRole(userId, clubId, role, reason) {
      await call("god_set_desk_role", {
        p_user: userId,
        p_club: clubId,
        p_role: role,
        p_reason: reasonArg(reason),
      });
    },

    async suspend(userId, apps, reason) {
      await call("god_suspend", { p_user: userId, p_apps: apps, p_reason: reason });
    },

    async restore(userId, reason) {
      await call("god_restore", { p_user: userId, p_reason: reasonArg(reason) });
    },

    async signOutEverywhere(userId, reason) {
      await call("god_sign_out", { p_user: userId, p_reason: reasonArg(reason) });
    },

    async record(target, action, details, reason) {
      await call("god_record", {
        p_target: target,
        p_action: action,
        p_details: details,
        p_reason: reasonArg(reason),
      });
    },
  };
}
