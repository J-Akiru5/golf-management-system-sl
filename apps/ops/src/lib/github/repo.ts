import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceRoleSupabase } from "@/lib/supabase/service";
import type {
  GithubDirection,
  GithubIssue,
  GithubOutcome,
  GithubSyncLogRow,
  GithubUserMapRow,
  InboundStatus,
} from "./types";

/**
 * The database side of the sync.
 *
 * The functions `gh_apply_issue` and `gh_mark_task_synced` are newer than the hand-written Database
 * type, so the client is cast to the small shape below. That is the same approach `lib/access/repo`
 * uses. The database decides who may write; this module only names the calls.
 *
 * Two clients are available:
 *   - the session client, for the Settings screen and the member's own outbound push;
 *   - the service-role client, for the webhook and the owner's import, both of which run without a
 *     signed-in user. It is never handed to a page.
 */

type DbError = { message: string; code?: string | null };
type DbResult<T> = { data: T | null; error: DbError | null };

type ListQuery = {
  order(
    column: string,
    options: { ascending: boolean },
  ): { limit(count: number): PromiseLike<DbResult<unknown[]>> };
};

export interface GithubDb {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<DbResult<unknown>>;
  from(table: string): {
    select(columns: string): ListQuery;
    upsert(
      row: Record<string, unknown>,
      options: { onConflict: string },
    ): PromiseLike<{ error: DbError | null }>;
    delete(): { eq(column: string, value: string): PromiseLike<{ error: DbError | null }> };
  };
}

export type AppliedIssue = {
  status: InboundStatus;
  /** The stored row, as the database returned it, or null when it was not read. */
  task: Record<string, unknown> | null;
};

export interface GithubSyncRepo {
  listUserMap(): Promise<GithubUserMapRow[]>;
  saveUserMap(login: string, memberId: string): Promise<void>;
  removeUserMap(login: string): Promise<void>;
  listLog(limit?: number): Promise<GithubSyncLogRow[]>;
  applyIssue(issue: GithubIssue, direction?: GithubDirection): Promise<AppliedIssue>;
  markSynced(
    taskId: string,
    issue: GithubIssue | null,
    direction: GithubDirection,
    outcome: GithubOutcome,
    detail: string,
  ): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function fail(context: string, error: DbError): never {
  const wrapped = new Error(`${context}: ${error.message}`) as Error & { code?: string };
  if (error.code) wrapped.code = error.code;
  throw wrapped;
}

/** The JSON the two functions take. Snake case, because it is read by SQL keys. */
export function issuePayload(issue: GithubIssue): Record<string, unknown> {
  return {
    issue_number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    url: issue.url,
    milestone: issue.milestone,
    labels: issue.labels,
    assignees: issue.assignees,
    updated_at: issue.updatedAt,
  };
}

const INBOUND: ReadonlyArray<InboundStatus> = ["created", "applied", "skipped", "conflict"];

export function parseAppliedIssue(value: unknown): AppliedIssue {
  if (!isRecord(value)) throw new Error("The database returned an unreadable sync result.");
  const status = value.status;
  if (typeof status !== "string" || !(INBOUND as ReadonlyArray<string>).includes(status)) {
    throw new Error("The database returned an unreadable sync result.");
  }
  return {
    status: status as InboundStatus,
    task: isRecord(value.task) ? value.task : null,
  };
}

function parseMapRow(value: unknown): { login: string; memberId: string } | null {
  if (!isRecord(value)) return null;
  const login = asText(value.github_login);
  const memberId = asText(value.member_id);
  if (login === null || memberId === null) return null;
  return { login, memberId };
}

function parseLogRow(value: unknown): GithubSyncLogRow | null {
  if (!isRecord(value)) return null;
  const direction = value.direction;
  const outcome = value.outcome;
  if (direction !== "inbound" && direction !== "outbound") return null;
  if (
    outcome !== "applied" &&
    outcome !== "skipped" &&
    outcome !== "conflict" &&
    outcome !== "error"
  ) {
    return null;
  }
  const id = asNumber(value.id);
  const createdAt = asText(value.created_at);
  if (id === null || createdAt === null) return null;
  return {
    id: String(id),
    taskId: asText(value.task_id),
    issueNumber: asNumber(value.issue_number),
    direction,
    outcome,
    detail: asText(value.detail),
    createdAt,
  };
}

export function createGithubSyncRepo(db: GithubDb): GithubSyncRepo {
  async function listUserMap(): Promise<GithubUserMapRow[]> {
    const mapQuery = await db
      .from("github_user_map")
      .select("github_login, member_id")
      .order("github_login", { ascending: true })
      .limit(500);
    if (mapQuery.error) fail("Could not read the GitHub user map", mapQuery.error);
    const rows = (mapQuery.data ?? [])
      .map(parseMapRow)
      .filter((row): row is { login: string; memberId: string } => row !== null);

    const members = await db
      .from("workspace_members")
      .select("user_id, display_name")
      .order("display_name", { ascending: true })
      .limit(500);
    if (members.error) fail("Could not read the workspace members", members.error);
    const names = new Map<string, string>();
    for (const member of members.data ?? []) {
      if (!isRecord(member)) continue;
      const id = asText(member.user_id);
      const name = asText(member.display_name);
      if (id && name) names.set(id, name);
    }

    return rows.map((row) => ({ ...row, memberName: names.get(row.memberId) ?? "Former member" }));
  }

  async function saveUserMap(login: string, memberId: string): Promise<void> {
    const { error } = await db
      .from("github_user_map")
      .upsert({ github_login: login, member_id: memberId }, { onConflict: "github_login" });
    if (error) fail("Could not save the GitHub login", error);
  }

  async function removeUserMap(login: string): Promise<void> {
    const { error } = await db.from("github_user_map").delete().eq("github_login", login);
    if (error) fail("Could not remove the GitHub login", error);
  }

  async function listLog(limit = 20): Promise<GithubSyncLogRow[]> {
    const { data, error } = await db
      .from("github_sync_log")
      .select("id, task_id, issue_number, direction, outcome, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));
    if (error) fail("Could not read the GitHub sync log", error);
    return (data ?? []).map(parseLogRow).filter((row): row is GithubSyncLogRow => row !== null);
  }

  async function applyIssue(
    issue: GithubIssue,
    direction: GithubDirection = "inbound",
  ): Promise<AppliedIssue> {
    const { data, error } = await db.rpc("gh_apply_issue", {
      p_issue: issuePayload(issue),
      p_direction: direction,
    });
    if (error) fail("Could not apply the GitHub issue", error);
    return parseAppliedIssue(data);
  }

  async function markSynced(
    taskId: string,
    issue: GithubIssue | null,
    direction: GithubDirection,
    outcome: GithubOutcome,
    detail: string,
  ): Promise<void> {
    const { error } = await db.rpc("gh_mark_task_synced", {
      p_task_id: taskId,
      p_issue: issue ? issuePayload(issue) : null,
      p_direction: direction,
      p_outcome: outcome,
      p_detail: detail.slice(0, 500),
    });
    if (error) fail("Could not record the GitHub change", error);
  }

  return { listUserMap, saveUserMap, removeUserMap, listLog, applyIssue, markSynced };
}

/** The repository as the signed-in member. Row level security applies. */
export async function serverGithubRepo(): Promise<GithubSyncRepo> {
  const client = (await getServerSupabase()) as unknown as GithubDb;
  return createGithubSyncRepo(client);
}

/**
 * The repository with the service role, for the webhook and the owner's import. Null when the key
 * is not set, so the caller can say what is missing instead of failing the whole screen.
 */
export function serviceGithubRepo(): GithubSyncRepo | null {
  const client = getServiceRoleSupabase();
  if (!client) return null;
  return createGithubSyncRepo(client as unknown as GithubDb);
}
