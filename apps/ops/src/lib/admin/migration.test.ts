import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The god mode migration, applied to an in-process Postgres with stand-ins for the Supabase auth
 * schema. This is the only check that the SQL parses and that the owner gate, suspend, restore and
 * audit really behave. It never touches a real project.
 */

const OWNER = "00000000-0000-0000-0000-00000000000a";
const TARGET = "00000000-0000-0000-0000-00000000000b";
const CLUB = "00000000-0000-0000-0000-0000000000c1";

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
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz,
  refreshed_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'organizer' check (role in ('owner', 'organizer', 'desk')),
  display_name text,
  primary key (club_id, user_id)
);
create table public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  full_name text not null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
`;

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

async function ownerQuery(sql: string): Promise<Array<Record<string, unknown>>> {
  return as(OWNER, sql);
}

beforeAll(async () => {
  await db.exec(STUBS);
  await db.exec(migration("20261120000100_workspace_members.sql"));
  await db.exec(migration("20261123000100_god_mode.sql"));

  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
      ('${OWNER}', 'owner@example.test', now(), '{"display_name":"Olive Owner"}'::jsonb),
      ('${TARGET}', 'target@example.test', now(), '{"display_name":"Terry Target"}'::jsonb);

    insert into public.workspace_members (user_id, role, status, display_name) values
      ('${OWNER}', 'owner', 'active', 'Olive Owner'),
      ('${TARGET}', 'member', 'active', 'Terry Target');

    insert into public.clubs (id, name) values ('${CLUB}', 'IGCC');

    insert into public.club_members (club_id, user_id, role, display_name) values
      ('${CLUB}', '${TARGET}', 'desk', 'Terry Target');

    insert into auth.sessions (user_id, updated_at) values ('${TARGET}', now());
  `);
}, 60_000);

describe("god_list_accounts", () => {
  it("returns every account with its access for the owner", async () => {
    const rows = await ownerQuery("select * from public.god_list_accounts()");
    expect(rows).toHaveLength(2);

    const target = rows.find((row) => row.user_id === TARGET);
    expect(target).toBeDefined();
    expect(target).toMatchObject({
      email: "target@example.test",
      display_name: "Terry Target",
      workspace_role: "member",
      workspace_status: "active",
      tabulator: false,
      suspended: false,
    });
    expect(target?.desk_roles).toEqual([{ clubId: CLUB, clubName: "IGCC", role: "desk" }]);
  });

  it("refuses anyone who is not an active workspace owner", async () => {
    await expect(as(TARGET, "select * from public.god_list_accounts()")).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("workspace and desk roles", () => {
  it("sets a workspace role and records it", async () => {
    await ownerQuery(`select public.god_set_workspace_role('${TARGET}', 'partner', 'promoted')`);

    const rows = await db.query<{ role: string }>(
      `select role from public.workspace_members where user_id = '${TARGET}'`,
    );
    expect(rows.rows[0]?.role).toBe("partner");

    const audit = await ownerQuery(
      `select action, reason from public.god_audit_list(10) where action = 'workspace_role'`,
    );
    expect(audit[0]).toMatchObject({ action: "workspace_role", reason: "promoted" });
  });

  it("removes a desk role and records it", async () => {
    await ownerQuery(`select public.god_set_desk_role('${TARGET}', '${CLUB}', 'none', 'moved on')`);

    const rows = await db.query(
      `select 1 from public.club_members where user_id = '${TARGET}' and club_id = '${CLUB}'`,
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("needs a reason before it removes a role, even through a direct call", async () => {
    await expect(
      ownerQuery(`select public.god_set_workspace_role('${TARGET}', 'none', null)`),
    ).rejects.toMatchObject({ code: "22023" });
  });
});

describe("suspend and restore", () => {
  it("refuses to suspend yourself and the last active owner", async () => {
    await expect(
      ownerQuery(`select public.god_suspend('${OWNER}', array['workspace'], 'testing self')`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("records what the person had, removes it, signs them out and puts it back", async () => {
    // Put the desk role and a tabulator flag back first, so the snapshot has something to hold.
    await ownerQuery(`select public.god_set_desk_role('${TARGET}', '${CLUB}', 'desk', null)`);
    await db.exec(
      `update auth.users set raw_app_meta_data = '{"scorecard_role":"tabulation"}'::jsonb where id = '${TARGET}'`,
    );

    await ownerQuery(
      `select public.god_suspend('${TARGET}', array['workspace','desk','tabulator'], 'left the club')`,
    );

    const suspended = await db.query<{
      previous: { workspace: { role: string } | null; desk: unknown[]; tabulator: boolean };
      restored_at: string | null;
    }>(`select previous, restored_at from public.god_suspensions where user_id = '${TARGET}'`);
    expect(suspended.rows[0]?.restored_at).toBeNull();
    expect(suspended.rows[0]?.previous.workspace?.role).toBe("partner");
    expect(suspended.rows[0]?.previous.desk).toHaveLength(1);
    expect(suspended.rows[0]?.previous.tabulator).toBe(true);

    const members = await db.query(
      `select 1 from public.workspace_members where user_id = '${TARGET}'`,
    );
    expect(members.rows).toHaveLength(0);

    const sessions = await db.query(`select 1 from auth.sessions where user_id = '${TARGET}'`);
    expect(sessions.rows).toHaveLength(0);

    const metadata = await db.query<{ app: Record<string, unknown> }>(
      `select raw_app_meta_data as app from auth.users where id = '${TARGET}'`,
    );
    expect(metadata.rows[0]?.app.scorecard_role).toBeUndefined();

    await ownerQuery(`select public.god_restore('${TARGET}', 'back on the team')`);

    const restored = await db.query<{ role: string; status: string }>(
      `select role, status from public.workspace_members where user_id = '${TARGET}'`,
    );
    expect(restored.rows[0]).toEqual({ role: "partner", status: "active" });

    const desks = await db.query<{ role: string }>(
      `select role from public.club_members where user_id = '${TARGET}'`,
    );
    expect(desks.rows[0]?.role).toBe("desk");

    const restoredMeta = await db.query<{ app: Record<string, unknown> }>(
      `select raw_app_meta_data as app from auth.users where id = '${TARGET}'`,
    );
    expect(restoredMeta.rows[0]?.app.scorecard_role).toBe("tabulation");

    // A second suspend after a restore reuses the one row rather than failing on the primary key.
    await ownerQuery(`select public.god_suspend('${TARGET}', array['workspace'], 'second time')`);
    const again = await db.query<{ restored_at: string | null; apps: string[] }>(
      `select restored_at, apps from public.god_suspensions where user_id = '${TARGET}'`,
    );
    expect(again.rows[0]?.restored_at).toBeNull();
    expect(again.rows[0]?.apps).toEqual(["workspace"]);
  });
});

describe("audit and grants", () => {
  it("lists the log for the owner", async () => {
    const rows = await ownerQuery("select action from public.god_audit_list(20)");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("never lets anon execute a god_ function", async () => {
    const rows = await db.query<{ anon_execute: boolean }>(
      `select has_function_privilege('anon', 'public.god_list_accounts()', 'execute') as anon_execute`,
    );
    expect(rows.rows[0]?.anon_execute).toBe(false);
  });
});

describe("the paste-ready copy", () => {
  it("carries the migration verbatim, so the two cannot drift", () => {
    const migrationText = migration("20261123000100_god_mode.sql").trim();
    const applyText = readFileSync(
      fileURLToPath(new URL("../../../../../docs/god-mode/apply-on-live.sql", import.meta.url)),
      "utf8",
    );
    expect(applyText).toContain(migrationText);
  });
});
