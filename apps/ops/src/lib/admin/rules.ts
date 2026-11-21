import type { WorkspaceMemberStatus, WorkspaceRole } from "@/lib/db/types";
import type {
  AccountAppFilter,
  AccountFilters,
  AccountRoleFilter,
  AccountSortKey,
  AccountStats,
  AccountStatusFilter,
  AdminActionResult,
  BulkAdminResult,
  BulkFailure,
  DeskRole,
  DeskRoleInput,
  GodAccount,
  GodAccountStatus,
  GodApp,
  WorkspaceRoleInput,
} from "./types";
import { GOD_APPS } from "./types";

/**
 * The Admin rules, as pure functions: status, the inactive flag, filters, sort, page and the
 * validation every action shares. The database still enforces access; these functions only decide
 * what the screen shows and what it sends.
 */

export const INACTIVE_DAYS = 30;
export const MIN_REASON_LENGTH = 5;
export const PAGE_SIZE = 25;

export const REASON_REQUIRED = "Enter a reason of at least 5 characters.";
export const OWNER_ONLY_MESSAGE = "Only a workspace owner can open Admin.";

/** The desk role labels the control offers. */
export const DESK_ROLE_OPTIONS: ReadonlyArray<{ id: DeskRole; label: string }> = [
  { id: "owner", label: "Owner" },
  { id: "organizer", label: "Organizer" },
  { id: "desk", label: "Desk" },
];

const WORKSPACE_ROLES: ReadonlyArray<WorkspaceRole> = ["owner", "partner", "member"];
const DESK_ROLES: ReadonlyArray<DeskRole> = ["owner", "organizer", "desk"];

export function isWorkspaceRoleInput(value: unknown): value is WorkspaceRoleInput {
  return typeof value === "string" && [...WORKSPACE_ROLES, "none"].includes(value);
}

export function isDeskRoleInput(value: unknown): value is DeskRoleInput {
  return typeof value === "string" && [...DESK_ROLES, "none"].includes(value);
}

export function isGodApp(value: unknown): value is GodApp {
  return typeof value === "string" && (GOD_APPS as ReadonlyArray<string>).includes(value);
}

/** The known apps, in a stable order, without duplicates. */
export function normaliseApps(values: ReadonlyArray<unknown>): GodApp[] {
  const seen = new Set<GodApp>();
  for (const value of values) {
    if (isGodApp(value)) seen.add(value);
  }
  return GOD_APPS.filter((app) => seen.has(app));
}

/**
 * The one status word for a row. A suspend is shown before a ban, because restoring is the action
 * the reader is looking for. An invite that has not been used yet is "Invited"; an account that
 * exists but never confirmed its address is "Unconfirmed".
 */
export function accountStatus(account: GodAccount): GodAccountStatus {
  if (account.suspended) return "suspended";
  if (account.banned) return "banned";
  if (account.invitedPending) return "invited";
  if (!account.emailConfirmed) return "unconfirmed";
  return "active";
}

export function accountStatusLabel(status: GodAccountStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "invited":
      return "Invited";
    case "unconfirmed":
      return "Unconfirmed";
    case "banned":
      return "Banned";
  }
}

export function accountStatusTone(
  status: GodAccountStatus,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "suspended":
      return "danger";
    case "invited":
      return "info";
    case "unconfirmed":
      return "warning";
    case "banned":
      return "danger";
  }
}

/** The last thing we know the person did: a session refresh, a sign-in, or the account's creation. */
export function activityReference(account: GodAccount): string {
  return account.lastActiveAt ?? account.lastSignInAt ?? account.accountCreatedAt;
}

/** An account with no activity for 30 days is flagged. Never active counts from creation. */
export function isInactive(
  account: GodAccount,
  nowIso: string,
  days: number = INACTIVE_DAYS,
): boolean {
  const reference = activityReference(account);
  const then = Date.parse(reference);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return false;
  return now - then >= days * 24 * 60 * 60 * 1000;
}

/** Which apps this person has access to right now. */
export function appsForAccount(account: GodAccount): GodApp[] {
  const apps: GodApp[] = [];
  if (account.workspaceRole !== null && account.workspaceStatus === "active")
    apps.push("workspace");
  if (account.deskRoles.length > 0) apps.push("desk");
  if (account.tabulator) apps.push("tabulator");
  return apps;
}

export const EMPTY_FILTERS: AccountFilters = {
  search: "",
  app: "all",
  role: "all",
  status: "all",
  inactiveOnly: false,
};

function matchesApp(account: GodAccount, app: AccountAppFilter): boolean {
  switch (app) {
    case "all":
      return true;
    case "workspace":
      return account.workspaceRole !== null;
    case "desk":
      return account.deskRoles.length > 0;
    case "tabulator":
      return account.tabulator;
    case "player":
      return account.playerName !== null;
    case "none":
      return (
        account.workspaceRole === null &&
        account.deskRoles.length === 0 &&
        !account.tabulator &&
        account.playerName === null
      );
  }
}

function matchesRole(account: GodAccount, role: AccountRoleFilter): boolean {
  if (role === "all") return true;
  if (role === "none") {
    return account.workspaceRole === null && account.deskRoles.length === 0 && !account.tabulator;
  }
  if (account.workspaceRole === role) return true;
  return account.deskRoles.some((desk) => desk.role === role);
}

/** Search by name or email, then the app, role, status and inactive filters. */
export function filterAccounts(
  accounts: ReadonlyArray<GodAccount>,
  filters: AccountFilters,
  nowIso: string,
): GodAccount[] {
  const needle = filters.search.trim().toLowerCase();

  return accounts.filter((account) => {
    if (needle) {
      const name = account.displayName.toLowerCase();
      const email = (account.email ?? "").toLowerCase();
      if (!name.includes(needle) && !email.includes(needle)) return false;
    }
    if (!matchesApp(account, filters.app)) return false;
    if (!matchesRole(account, filters.role)) return false;
    if (filters.status !== "all" && accountStatus(account) !== filters.status) return false;
    if (filters.inactiveOnly && !isInactive(account, nowIso)) return false;
    return true;
  });
}

function textFor(account: GodAccount, key: AccountSortKey): string {
  switch (key) {
    case "name":
      return account.displayName;
    case "email":
      return account.email ?? "";
    case "workspace":
      return account.workspaceRole ?? "";
    case "desk":
      return account.deskRoles.map((desk) => `${desk.clubName} ${desk.role}`).join(", ");
    case "tabulator":
      return account.tabulator ? "1" : "0";
    case "status":
      return accountStatus(account);
    case "lastSignIn":
      return account.lastSignInAt ?? "";
    case "lastActive":
      return activityReference(account);
    case "created":
      return account.accountCreatedAt;
  }
}

/** Sort by a column. An account with no value for the column sorts last in both directions. */
export function sortAccounts(
  accounts: ReadonlyArray<GodAccount>,
  key: AccountSortKey,
  direction: "asc" | "desc",
): GodAccount[] {
  const dateKey = key === "lastSignIn" || key === "lastActive" || key === "created";
  const factor = direction === "asc" ? 1 : -1;

  return [...accounts].sort((a, b) => {
    const left = textFor(a, key);
    const right = textFor(b, key);

    if (left === "" && right === "") return a.displayName.localeCompare(b.displayName);
    if (left === "") return 1;
    if (right === "") return -1;

    if (dateKey) {
      const delta = Date.parse(left) - Date.parse(right);
      if (delta !== 0) return delta * factor;
    } else {
      const delta = left.localeCompare(right, "en", { sensitivity: "base" });
      if (delta !== 0) return delta * factor;
    }

    return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
  });
}

export function accountStats(accounts: ReadonlyArray<GodAccount>, nowIso: string): AccountStats {
  let activeStaff = 0;
  let suspended = 0;
  let invited = 0;
  let inactive = 0;

  for (const account of accounts) {
    const status = accountStatus(account);
    if (status === "suspended") suspended += 1;
    if (status === "invited") invited += 1;
    if (isInactive(account, nowIso)) inactive += 1;
    if (status === "active" && appsForAccount(account).length > 0) activeStaff += 1;
  }

  return { total: accounts.length, activeStaff, suspended, invited, inactive };
}

export type Pagination<T> = { items: T[]; page: number; pageCount: number };

/** Clamp a requested page into range. An empty list still reports one page. */
export function paginate<T>(
  items: ReadonlyArray<T>,
  page: number,
  pageSize: number = PAGE_SIZE,
): Pagination<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page || 1)), pageCount);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pageCount };
}

/** A required reason: at least 5 characters after trimming. */
export function reasonProblem(value: string): string | null {
  return value.trim().length >= MIN_REASON_LENGTH ? null : REASON_REQUIRED;
}

/** An optional reason: trimmed, or null when empty. */
export function cleanReason(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** A plain email check, the same one the invite form uses. */
export function isEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254;
}

/** The result of a bulk action, with a sentence that names the counts. */
export function bulkResult(
  action: string,
  total: number,
  failures: ReadonlyArray<BulkFailure>,
): BulkAdminResult {
  if (total === 0) {
    return {
      ok: false,
      message: "Choose at least one account.",
      succeeded: 0,
      failures: [],
    };
  }

  const succeeded = total - failures.length;
  if (failures.length === 0) {
    return {
      ok: true,
      message: `${action} ${succeeded} account${succeeded === 1 ? "" : "s"}.`,
      succeeded,
      failures: [],
    };
  }

  return {
    ok: succeeded > 0,
    message: `${action} ${succeeded} of ${total} accounts. ${failures.length} could not be changed.`,
    succeeded,
    failures: [...failures],
  };
}

/** A small helper for the single actions. */
export function actionResult(ok: boolean, message: string): AdminActionResult {
  return { ok, message };
}

export function workspaceStatusLabel(status: WorkspaceMemberStatus | null): string {
  if (status === null) return "none";
  return status === "active" ? "active" : "suspended";
}
