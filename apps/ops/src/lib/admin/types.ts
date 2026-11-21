import type { AccessLevel } from "@/lib/access/pages";
import type { WorkspaceMemberStatus, WorkspaceRole } from "@/lib/db/types";

/**
 * The shapes the Admin screens use. Pure types only, so a client component can import them.
 *
 * The database is the source of truth for what an account may do. These types describe what
 * `god_list_accounts()` returns and what the server actions accept.
 */

export type DeskRole = "owner" | "organizer" | "desk";
export type DeskRoleInput = DeskRole | "none";
export type WorkspaceRoleInput = WorkspaceRole | "none";

/** The three apps a suspend can take away. */
export const GOD_APPS = ["workspace", "desk", "tabulator"] as const;
export type GodApp = (typeof GOD_APPS)[number];

export type DeskAssignment = {
  clubId: string;
  clubName: string;
  role: DeskRole;
};

/** One row of `god_list_accounts()`. */
export type GodAccount = {
  userId: string;
  email: string | null;
  displayName: string;
  accountCreatedAt: string;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  emailConfirmed: boolean;
  invitedPending: boolean;
  banned: boolean;
  workspaceRole: WorkspaceRole | null;
  workspaceStatus: WorkspaceMemberStatus | null;
  deskRoles: DeskAssignment[];
  tabulator: boolean;
  playerName: string | null;
  suspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
};

export type GodAccountStatus = "active" | "suspended" | "invited" | "unconfirmed" | "banned";

export type AccountAppFilter = "all" | "workspace" | "desk" | "tabulator" | "player" | "none";
export type AccountRoleFilter = "all" | WorkspaceRole | DeskRole | "none";
export type AccountStatusFilter = "all" | GodAccountStatus;

export type AccountFilters = {
  search: string;
  app: AccountAppFilter;
  role: AccountRoleFilter;
  status: AccountStatusFilter;
  inactiveOnly: boolean;
};

export type AccountSortKey =
  | "name"
  | "email"
  | "workspace"
  | "desk"
  | "tabulator"
  | "status"
  | "lastSignIn"
  | "lastActive"
  | "created";

export type AccountStats = {
  total: number;
  activeStaff: number;
  suspended: number;
  invited: number;
  inactive: number;
};

/** One row of `god_audit_list()`. */
export type GodAuditEntry = {
  id: number;
  at: string;
  actorId: string | null;
  actorEmail: string | null;
  targetId: string | null;
  targetEmail: string | null;
  action: string;
  details: Record<string, unknown>;
  reason: string | null;
};

export type AdminClub = { id: string; name: string };

/** What the suspension recorded, mirrored from the `previous` jsonb. */
export type PreviousAccess = {
  workspace: { role: WorkspaceRole; status: WorkspaceMemberStatus } | null;
  desk: DeskAssignment[];
  tabulator: boolean;
};

export type AdminActionResult = { ok: boolean; message: string };

export type BulkFailure = { userId: string; email: string | null; message: string };

export type BulkAdminResult = {
  ok: boolean;
  message: string;
  succeeded: number;
  failures: BulkFailure[];
};

export type InviteInput = {
  email: string;
  displayName: string;
  workspaceRole: WorkspaceRoleInput;
  deskClubId: string | null;
  deskRole: DeskRoleInput;
  tabulator: boolean;
  note: string;
};

export type AccountListResult =
  | { ok: true; accounts: GodAccount[] }
  | { ok: false; message: string };

export type ClubListResult = { ok: true; clubs: AdminClub[] } | { ok: false; message: string };

export type AuditListResult =
  | { ok: true; entries: GodAuditEntry[] }
  | { ok: false; message: string };

export type AdminData = {
  accounts: GodAccount[];
  clubs: AdminClub[];
  audit: GodAuditEntry[];
};

export type AdminDataResult = { ok: true; data: AdminData } | { ok: false; message: string };

/**
 * The actions the page hands to the client console. Every one is a server action that checks the
 * caller is an active workspace owner before it does anything.
 */
export type AdminActions = {
  setWorkspaceRole(
    userId: string,
    role: WorkspaceRoleInput,
    reason: string,
  ): Promise<AdminActionResult>;
  setDeskRole(
    userId: string,
    clubId: string,
    role: DeskRoleInput,
    reason: string,
  ): Promise<AdminActionResult>;
  setTabulator(userId: string, enabled: boolean, reason: string): Promise<AdminActionResult>;
  suspend(userId: string, apps: GodApp[], reason: string): Promise<AdminActionResult>;
  restore(userId: string, reason: string): Promise<AdminActionResult>;
  signOutEverywhere(userId: string, reason: string): Promise<AdminActionResult>;
  sendPasswordReset(userId: string, reason: string): Promise<AdminActionResult>;
  invite(input: InviteInput): Promise<AdminActionResult>;
  bulkWorkspaceRole(
    userIds: string[],
    role: WorkspaceRoleInput,
    reason: string,
  ): Promise<BulkAdminResult>;
  bulkSuspend(userIds: string[], apps: GodApp[], reason: string): Promise<BulkAdminResult>;
  bulkRestore(userIds: string[], reason: string): Promise<BulkAdminResult>;
  bulkSignOut(userIds: string[], reason: string): Promise<BulkAdminResult>;
  /** One page for one person. A null level puts them back on the role default. */
  setUserPermission(
    userId: string,
    page: string,
    level: AccessLevel | null,
    reason: string,
  ): Promise<AdminActionResult>;
};
