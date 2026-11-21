import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The GitHub sync migration, applied to an in-process Postgres with stand-ins for the Supabase auth
 * schema and the two workspace migrations it builds on. This is the only check that the SQL parses,
 * that the write guard holds, and that the echo, conflict and status rules behave. It never touches
 * a real project and never calls GitHub.
 *
 * The issue timestamps are deliberately in the past. The workspace clock is the real one, so "the
 * workspace edit is newer" is what the test means whichever day it runs.
 */

const OWNER = "00000000-0000-0000-0000-00000000000a";
const MEMBER = "00000000-0000-0000-0000-00000000000b";
const OUTSIDER = "00000000-0000-0000-0000-00000000000c";

const STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  banned_until timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Tournament'
);
`;

const MIGRATIONS = [
  "20261120000100_workspace_members.sql",
  "20261120000300_workspace_pipeline_and_tasks.sql",
  "20261123000500_github_task_sync.sql",
];

function migration(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../../supabase/migrations/${name}`, import.meta.url)),
    "utf8",
  );
}

const db = new PGlite();

async function as(user: string, sql: string): Promise<Array<Record<string, unknown>>> {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`,
  );
  try {
    const result = await db.query<Record<string, unknown>>(sql);
    return result.rows;
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

/** The webhook's path: the service role, with no signed-in user. */
async function asService(sql: string): Promise<Array<Record<string, unknown>>> {
  await db.exec("set role service_role;");
  try {
    const result = await db.query<Record<string, unknown>>(sql);
    return result.rows;
  } finally {
    await db.exec("reset role;");
  }
}

function issue(overrides: Record<string, unknown> = {}): string {
  const payload = {
    issue_number: 350,
    title: "Two-way GitHub sync",
    body: "Issues for dev should show in the ops portal.",
    state: "open",
    url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
    milestone: "v1.0.0",
    labels: ["ops", "workspace"],
    assignees: ["karlcalimotan"],
    updated_at: "2020-01-01T00:00:00Z",
    ...overrides,
  };
  return JSON.stringify(payload);
}

async function sync(overrides: Record<string, unknown> = {}): Promise<string> {
  const rows = await asService(`select public.gh_apply_issue('${issue(overrides)}'::jsonb) as out`);
  return (rows[0]?.out as { status: string }).status;
}

beforeAll(async () => {
  await db.exec(STUBS);
  for (const name of MIGRATIONS) await db.exec(migration(name));

  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
      ('${OWNER}', 'owner@example.test', now(), '{"display_name":"Olive Owner"}'::jsonb),
      ('${MEMBER}', 'member@example.test', now(), '{"display_name":"Mo Member"}'::jsonb),
      ('${OUTSIDER}', 'outside@example.test', now(), '{"display_name":"Otto Outside"}'::jsonb);

    insert into public.workspace_members (user_id, role, status, display_name) values
      ('${OWNER}', 'owner', 'active', 'Olive Owner'),
      ('${MEMBER}', 'member', 'active', 'Mo Member');
  `);
}, 60_000);

describe("the schema", () => {
  it("adds the eight link columns to ws_tasks", async () => {
    const rows = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'ws_tasks'
         and (column_name like 'github%' or column_name = 'synced_at')
       order by column_name`,
    );
    expect(rows.rows.map((row) => row.column_name)).toEqual([
      "github_assignees",
      "github_issue_number",
      "github_labels",
      "github_milestone",
      "github_state",
      "github_updated_at",
      "github_url",
      "synced_at",
    ]);
  });

  it("keeps one task per issue number", async () => {
    const rows = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where schemaname = 'public' and tablename = 'ws_tasks'
         and indexdef like '%github_issue_number%' and indexdef like '%UNIQUE%'`,
    );
    expect(rows.rows).toHaveLength(1);
  });
});

describe("GitHub -> workspace", () => {
  it("refuses a session that is not the service role", async () => {
    await expect(
      as(MEMBER, `select public.gh_apply_issue('${issue()}'::jsonb)`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("creates a task for an issue that has never been seen", async () => {
    expect(await sync()).toBe("created");

    const task = await db.query<{ title: string; status: string; github_labels: string[] }>(
      `select title, status, github_labels from public.ws_tasks where github_issue_number = 350`,
    );
    expect(task.rows[0]).toMatchObject({
      title: "Two-way GitHub sync",
      status: "todo",
      github_labels: ["ops", "workspace"],
    });

    const log = await db.query<{ direction: string; outcome: string }>(
      "select direction, outcome from public.github_sync_log order by id desc limit 1",
    );
    expect(log.rows[0]).toEqual({ direction: "inbound", outcome: "applied" });
  });

  it("skips an event that is not newer than the last sync", async () => {
    expect(await sync()).toBe("skipped");

    const log = await db.query<{ outcome: string; detail: string }>(
      "select outcome, detail from public.github_sync_log order by id desc limit 1",
    );
    expect(log.rows[0]).toEqual({
      outcome: "skipped",
      detail: "No newer change than the last sync",
    });
  });

  it("applies a newer change, including labels, milestone and the mapped assignee", async () => {
    await as(
      OWNER,
      `insert into public.github_user_map (github_login, member_id)
       values ('karlcalimotan', '${MEMBER}')`,
    );

    expect(
      await sync({
        title: "Two-way GitHub sync, from GitHub",
        labels: ["ops", "workspace", "sync"],
        updated_at: "2020-01-02T00:00:00Z",
      }),
    ).toBe("applied");

    const task = await db.query<{
      title: string;
      status: string;
      assignee_id: string | null;
      github_labels: string[];
      github_assignees: string[];
      github_milestone: string;
      github_state: string;
    }>(
      `select title, status, assignee_id, github_labels, github_assignees, github_milestone,
              github_state
       from public.ws_tasks where github_issue_number = 350`,
    );
    expect(task.rows[0]).toMatchObject({
      title: "Two-way GitHub sync, from GitHub",
      status: "todo",
      assignee_id: MEMBER,
      github_labels: ["ops", "sync", "workspace"],
      github_assignees: ["karlcalimotan"],
      github_milestone: "v1.0.0",
      github_state: "open",
    });
  });

  it("marks a task done when the issue closes and returns it to to do when it reopens", async () => {
    expect(await sync({ issue_number: 351, state: "closed" })).toBe("created");

    let rows = await db.query<{ status: string; completed_at: string | null }>(
      "select status, completed_at from public.ws_tasks where github_issue_number = 351",
    );
    expect(rows.rows[0]?.status).toBe("done");
    expect(rows.rows[0]?.completed_at).not.toBeNull();

    expect(
      await sync({ issue_number: 351, state: "open", updated_at: "2020-01-02T00:00:00Z" }),
    ).toBe("applied");
    rows = await db.query<{ status: string; completed_at: string | null }>(
      "select status, completed_at from public.ws_tasks where github_issue_number = 351",
    );
    expect(rows.rows[0]?.status).toBe("todo");
    expect(rows.rows[0]?.completed_at).toBeNull();
  });

  it("keeps the newer workspace edit and logs the conflict", async () => {
    expect(await sync({ issue_number: 360, title: "Original title" })).toBe("created");

    await as(
      MEMBER,
      `update public.ws_tasks set title = 'The workspace title'
       where github_issue_number = 360`,
    );

    expect(
      await sync({
        issue_number: 360,
        title: "An older GitHub title",
        labels: ["ops"],
        updated_at: "2020-01-02T00:00:00Z",
      }),
    ).toBe("conflict");

    const task = await db.query<{ title: string; github_labels: string[] }>(
      "select title, github_labels from public.ws_tasks where github_issue_number = 360",
    );
    expect(task.rows[0]?.title).toBe("The workspace title");
    expect(task.rows[0]?.github_labels).toEqual(["ops"]);

    const log = await db.query<{ direction: string; outcome: string; detail: string }>(
      "select direction, outcome, detail from public.github_sync_log order by id desc limit 1",
    );
    expect(log.rows[0]?.outcome).toBe("conflict");
    expect(log.rows[0]?.detail).toContain("newer workspace edit was kept");
  });

  it("does not count a sync-only write as a workspace edit", async () => {
    expect(await sync({ issue_number: 370 })).toBe("created");
    const before = await db.query<{ updated_at: Date; synced_at: Date }>(
      "select updated_at, synced_at from public.ws_tasks where github_issue_number = 370",
    );

    expect(
      await sync({ issue_number: 370, labels: ["ops"], updated_at: "2020-01-02T00:00:00Z" }),
    ).toBe("applied");

    const after = await db.query<{
      updated_at: Date;
      synced_at: Date;
      github_labels: string[];
    }>(
      "select updated_at, synced_at, github_labels from public.ws_tasks where github_issue_number = 370",
    );
    // A sync writes both stamps in one statement, so the row never looks edited since the last sync.
    expect(after.rows[0]?.github_labels).toEqual(["ops"]);
    expect(after.rows[0]?.synced_at.getTime()).toBeGreaterThanOrEqual(
      after.rows[0]?.updated_at.getTime() ?? 0,
    );
    expect(before.rows[0]?.synced_at.getTime()).toBeGreaterThanOrEqual(
      before.rows[0]?.updated_at.getTime() ?? 0,
    );
  });

  it("refuses a payload with no issue number or no updated_at", async () => {
    await expect(
      asService(`select public.gh_apply_issue('{"title":"No number"}'::jsonb)`),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      asService(
        `select public.gh_apply_issue('{"issue_number":7,"title":"No stamp","updated_at":null}'::jsonb)`,
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });
});

describe("the write guard", () => {
  it("refuses a link written straight to the table by a member", async () => {
    await expect(
      as(
        MEMBER,
        `insert into public.ws_tasks (title, github_issue_number)
         values ('Faked link', 999)`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses a mirrored column changed straight on the table", async () => {
    await expect(
      as(
        MEMBER,
        `update public.ws_tasks set github_state = 'closed'
         where github_issue_number = 350`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("still lets a member edit the workspace columns of a linked task", async () => {
    const rows = await as(
      MEMBER,
      `update public.ws_tasks set title = 'Edited in the workspace'
       where github_issue_number = 350 returning id, title`,
    );
    expect(rows[0]?.title).toBe("Edited in the workspace");
  });
});

describe("workspace -> GitHub", () => {
  it("records what GitHub returned and logs the push", async () => {
    const task = await db.query<{ id: string; updated_at: Date }>(
      "select id, updated_at from public.ws_tasks where github_issue_number = 350",
    );
    const taskId = task.rows[0]?.id;

    await as(
      MEMBER,
      `select public.gh_mark_task_synced(
        '${taskId}',
        '${issue({
          title: "Pushed from the workspace",
          labels: ["ops", "workspace", "pushed"],
          assignees: ["karlcalimotan"],
          updated_at: "2020-01-05T00:00:00Z",
        })}'::jsonb,
        'outbound',
        'applied',
        'Title, status and assignee pushed'
      )`,
    );

    const row = await db.query<{
      github_labels: string[];
      github_updated_at: Date;
      updated_at: Date;
      synced_at: Date;
      title: string;
    }>(
      "select github_labels, github_updated_at, updated_at, synced_at, title from public.ws_tasks where id = $1",
      [taskId],
    );
    // The push records GitHub's answer but does not rename the local task: the workspace is the
    // side that changed and already has the title it pushed. The row is synced, not edited.
    expect(row.rows[0]?.github_labels).toEqual(["ops", "pushed", "workspace"]);
    expect(row.rows[0]?.github_updated_at.toISOString()).toBe("2020-01-05T00:00:00.000Z");
    expect(row.rows[0]?.title).toBe("Edited in the workspace");
    expect(row.rows[0]?.synced_at.getTime()).toBeGreaterThanOrEqual(
      row.rows[0]?.updated_at.getTime() ?? 0,
    );

    const log = await db.query<{ direction: string; outcome: string; detail: string }>(
      "select direction, outcome, detail from public.github_sync_log order by id desc limit 1",
    );
    expect(log.rows[0]).toEqual({
      direction: "outbound",
      outcome: "applied",
      detail: "Title, status and assignee pushed",
    });
  });

  it("refuses a session that is not on the member list", async () => {
    await expect(
      as(
        OUTSIDER,
        `select public.gh_mark_task_synced(
          '00000000-0000-0000-0000-0000000000ff', null, 'outbound', 'error', 'x'
        )`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses an unknown outcome", async () => {
    const task = await db.query<{ id: string }>(
      "select id from public.ws_tasks where github_issue_number = 350",
    );
    await expect(
      as(
        MEMBER,
        `select public.gh_mark_task_synced('${task.rows[0]?.id}', null, 'outbound', 'maybe', 'x')`,
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });
});

describe("the user map", () => {
  it("is readable by a member and writable only by an owner", async () => {
    const read = await as(MEMBER, "select github_login from public.github_user_map");
    expect(read).toHaveLength(1);

    await expect(
      as(
        MEMBER,
        `insert into public.github_user_map (github_login, member_id)
         values ('dev-lou', '${MEMBER}')`,
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await as(
      OWNER,
      `insert into public.github_user_map (github_login, member_id)
       values ('dev-lou', '${MEMBER}')`,
    );
    const after = await db.query("select github_login from public.github_user_map");
    expect(after.rows).toHaveLength(2);
  });

  it("refuses a login stored with capitals, because matching is case-insensitive", async () => {
    await expect(
      as(
        OWNER,
        `insert into public.github_user_map (github_login, member_id)
         values ('Karlcalimotan', '${MEMBER}')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("the log", () => {
  it("is readable by an owner only", async () => {
    const rows = await as(OWNER, "select id from public.github_sync_log");
    expect(rows.length).toBeGreaterThan(0);

    const hidden = await as(MEMBER, "select id from public.github_sync_log");
    expect(hidden).toHaveLength(0);
  });

  it("cannot be written through the table, even by an owner", async () => {
    await expect(
      as(
        OWNER,
        `insert into public.github_sync_log (direction, outcome, detail)
         values ('inbound', 'applied', 'written by hand')`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("the paste-ready copy", () => {
  it("carries the migration verbatim, so the two cannot drift", () => {
    const migrationText = migration("20261123000500_github_task_sync.sql").trim();
    const applyText = readFileSync(
      fileURLToPath(new URL("../../../../../docs/github-sync/apply-on-live.sql", import.meta.url)),
      "utf8",
    );
    expect(applyText).toContain(migrationText);
  });
});
