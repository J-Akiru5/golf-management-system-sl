import { describe, expect, it } from "vitest";
import { createGithubSyncRepo, type GithubDb, issuePayload, parseAppliedIssue } from "./repo";
import type { GithubIssue } from "./types";

const ISSUE: GithubIssue = {
  number: 350,
  title: "Two-way GitHub sync",
  body: "Issues for dev should show in the ops portal.",
  state: "open",
  labels: ["ops", "workspace"],
  milestone: "v1.0.0",
  assignees: ["karlcalimotan"],
  url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
  updatedAt: "2026-11-21T09:00:00Z",
};

type Calls = {
  rpc: Array<{ name: string; args: Record<string, unknown> | undefined }>;
  upserts: Array<{ table: string; row: Record<string, unknown>; onConflict: string }>;
  deletes: Array<{ table: string; column: string; value: string }>;
  limits: Array<{ table: string; count: number }>;
};

function fakeDb(options: {
  rpc?: (name: string) => { data: unknown; error: { message: string; code?: string } | null };
  tables?: Record<string, unknown[]>;
}): { db: GithubDb; calls: Calls } {
  const calls: Calls = { rpc: [], upserts: [], deletes: [], limits: [] };
  const tables = options.tables ?? {};

  const db: GithubDb = {
    rpc(name, args) {
      calls.rpc.push({ name, args });
      const result = options.rpc?.(name) ?? { data: null, error: null };
      return Promise.resolve(result);
    },
    from(table) {
      return {
        select() {
          return {
            order() {
              return {
                limit(count) {
                  calls.limits.push({ table, count });
                  return Promise.resolve({ data: tables[table] ?? [], error: null });
                },
              };
            },
          };
        },
        upsert(row, opts) {
          calls.upserts.push({ table, row, onConflict: opts.onConflict });
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(column, value) {
              calls.deletes.push({ table, column, value });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { db, calls };
}

describe("the sync repository", () => {
  it("sends the snake case issue the SQL function reads", () => {
    expect(issuePayload(ISSUE)).toEqual({
      issue_number: 350,
      title: "Two-way GitHub sync",
      body: "Issues for dev should show in the ops portal.",
      state: "open",
      url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
      milestone: "v1.0.0",
      labels: ["ops", "workspace"],
      assignees: ["karlcalimotan"],
      updated_at: "2026-11-21T09:00:00Z",
    });
  });

  it("applies an issue and reads the answer", async () => {
    const { db, calls } = fakeDb({
      rpc: () => ({
        data: { status: "conflict", task: { id: "task-1", title: "Local" } },
        error: null,
      }),
    });
    const repo = createGithubSyncRepo(db);

    const result = await repo.applyIssue(ISSUE);
    expect(result).toEqual({ status: "conflict", task: { id: "task-1", title: "Local" } });
    expect(calls.rpc[0]?.name).toBe("gh_apply_issue");
    expect(calls.rpc[0]?.args?.p_issue).toMatchObject({ issue_number: 350 });
    expect(calls.rpc[0]?.args?.p_direction).toBe("inbound");
  });

  it("refuses an unreadable answer instead of guessing", () => {
    expect(() => parseAppliedIssue({ status: "maybe" })).toThrow(
      "The database returned an unreadable sync result.",
    );
    expect(() => parseAppliedIssue(null)).toThrow(
      "The database returned an unreadable sync result.",
    );
  });

  it("records a push with GitHub's answer, or null when there is nothing to record", async () => {
    const { db, calls } = fakeDb({ rpc: () => ({ data: null, error: null }) });
    const repo = createGithubSyncRepo(db);

    await repo.markSynced("task-1", ISSUE, "outbound", "applied", "Title pushed");
    expect(calls.rpc[0]?.name).toBe("gh_mark_task_synced");
    expect(calls.rpc[0]?.args).toMatchObject({
      p_task_id: "task-1",
      p_direction: "outbound",
      p_outcome: "applied",
      p_detail: "Title pushed",
    });
    expect(calls.rpc[0]?.args?.p_issue).toMatchObject({ issue_number: 350 });

    await repo.markSynced("task-1", null, "outbound", "error", "x".repeat(900));
    expect(calls.rpc[1]?.args?.p_issue).toBeNull();
    expect(String(calls.rpc[1]?.args?.p_detail)).toHaveLength(500);
  });

  it("keeps the database's error code and cannot be mistaken for success", async () => {
    const { db } = fakeDb({
      rpc: () => ({ data: null, error: { message: "permission denied", code: "42501" } }),
    });
    const repo = createGithubSyncRepo(db);

    await expect(repo.applyIssue(ISSUE)).rejects.toMatchObject({
      message: "Could not apply the GitHub issue: permission denied",
      code: "42501",
    });
  });

  it("joins each login to its member name, and says so when the member is gone", async () => {
    const { db } = fakeDb({
      tables: {
        github_user_map: [
          { github_login: "karlcalimotan", member_id: "member-karl" },
          { github_login: "dev-lou", member_id: "member-gone" },
          { github_login: "broken" },
        ],
        workspace_members: [
          { user_id: "member-karl", display_name: "Karl C." },
          { user_id: "member-lou", display_name: "Lou" },
        ],
      },
    });

    const rows = await createGithubSyncRepo(db).listUserMap();
    expect(rows).toEqual([
      { login: "karlcalimotan", memberId: "member-karl", memberName: "Karl C." },
      { login: "dev-lou", memberId: "member-gone", memberName: "Former member" },
    ]);
  });

  it("saves and removes a mapping by the lower-case login", async () => {
    const { db, calls } = fakeDb({});
    const repo = createGithubSyncRepo(db);

    await repo.saveUserMap("karlcalimotan", "member-karl");
    expect(calls.upserts[0]).toEqual({
      table: "github_user_map",
      row: { github_login: "karlcalimotan", member_id: "member-karl" },
      onConflict: "github_login",
    });

    await repo.removeUserMap("dev-lou");
    expect(calls.deletes[0]).toEqual({
      table: "github_user_map",
      column: "github_login",
      value: "dev-lou",
    });
  });

  it("reads the log newest first and drops a row it cannot read", async () => {
    const { db, calls } = fakeDb({
      tables: {
        github_sync_log: [
          {
            id: "12",
            task_id: "task-1",
            issue_number: 350,
            direction: "outbound",
            outcome: "applied",
            detail: "Title pushed",
            created_at: "2026-11-21T10:00:00Z",
          },
          {
            id: 11,
            task_id: null,
            issue_number: 7,
            direction: "inbound",
            outcome: "conflict",
            detail: null,
            created_at: "2026-11-21T09:00:00Z",
          },
          { id: 10, direction: "sideways", outcome: "applied" },
          { id: 9, direction: "inbound", outcome: "maybe" },
        ],
      },
    });

    const rows = await createGithubSyncRepo(db).listLog(20);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: "12",
      taskId: "task-1",
      issueNumber: 350,
      direction: "outbound",
      outcome: "applied",
      detail: "Title pushed",
      createdAt: "2026-11-21T10:00:00Z",
    });
    expect(rows[1]?.detail).toBeNull();
    expect(calls.limits[0]).toEqual({ table: "github_sync_log", count: 20 });
  });

  it("caps the limit the database is asked for", async () => {
    const { db, calls } = fakeDb({});
    await createGithubSyncRepo(db).listLog(10_000);
    expect(calls.limits[0]?.count).toBe(200);
  });
});
