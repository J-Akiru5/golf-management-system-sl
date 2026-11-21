import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ROLE_DEFAULTS, WORKSPACE_ROLES } from "./pages";

/**
 * The permissions migration, applied to an in-process Postgres with stand-ins for the Supabase
 * schemas. This is the only check that the SQL parses, that the seed matches the TypeScript role
 * defaults, and that ws_can, the overrides and the narrowed policies behave. It never touches a real
 * project.
 */

const OWNER = "00000000-0000-0000-0000-00000000000a";
const PARTNER = "00000000-0000-0000-0000-00000000000b";
const MEMBER = "00000000-0000-0000-0000-00000000000c";
const OUTSIDER = "00000000-0000-0000-0000-00000000000d";
const NEWCOMER = "00000000-0000-0000-0000-00000000000e";

const ACCOUNT = `email text, created_at timestamptz not null default now()`;

const STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create table auth.users (
  id uuid primary key,
  ${ACCOUNT},
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
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Tournament'
);

-- The Realtime objects the part 4 policies and triggers use. No messages are sent in this test.
create schema realtime;
create table realtime.messages (
  id bigint generated always as identity primary key,
  extension text,
  topic text,
  payload jsonb
);
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '') $$;
create function realtime.broadcast_changes(
  p_topic text, p_event text, p_op text, p_table_name text, p_schema text,
  p_new record, p_old record
) returns void language plpgsql as $$ begin return; end $$;
`;

const MIGRATIONS = [
  "20261120000100_workspace_members.sql",
  "20261120000200_workspace_docs.sql",
  "20261120000300_workspace_pipeline_and_tasks.sql",
  "20261120000400_workspace_realtime.sql",
  "20261123000000_ai_provider_settings.sql",
  "20261123000100_god_mode.sql",
  "20261123000200_workspace_permissions.sql",
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

async function asOwner(sql: string): Promise<Array<Record<string, unknown>>> {
  return as(OWNER, sql);
}

async function scalar(column: string, user: string, statement: string): Promise<unknown> {
  const rows = await as(user, statement);
  return rows[0]?.[column];
}

beforeAll(async () => {
  await db.exec(STUBS);
  for (const name of MIGRATIONS) await db.exec(migration(name));

  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
      ('${OWNER}', 'owner@example.test', now(), '{"display_name":"Olive Owner"}'::jsonb),
      ('${PARTNER}', 'partner@example.test', now(), '{"display_name":"Pat Partner"}'::jsonb),
      ('${MEMBER}', 'member@example.test', now(), '{"display_name":"Mo Member"}'::jsonb),
      ('${OUTSIDER}', 'outside@example.test', now(), '{"display_name":"Otto Outside"}'::jsonb),
      ('${NEWCOMER}', 'new@example.test', now(), '{"display_name":"New Member"}'::jsonb);

    insert into public.workspace_members (user_id, role, status, display_name) values
      ('${OWNER}', 'owner', 'active', 'Olive Owner'),
      ('${PARTNER}', 'partner', 'active', 'Pat Partner'),
      ('${MEMBER}', 'member', 'active', 'Mo Member');
  `);
}, 60_000);

describe("the seed matches the TypeScript role defaults", () => {
  it("has one row per role and page, with the same level", async () => {
    const rows = await db.query<{ role: string; page: string; level: string }>(
      "select role, page, level from public.ws_role_permissions",
    );

    expect(rows.rows).toHaveLength(WORKSPACE_ROLES.length * 8);

    for (const row of rows.rows) {
      if (!(WORKSPACE_ROLES as ReadonlyArray<string>).includes(row.role)) {
        throw new Error(`unexpected role ${row.role}`);
      }
      const role = row.role as keyof typeof ROLE_DEFAULTS;
      const expected = ROLE_DEFAULTS[role][row.page as keyof (typeof ROLE_DEFAULTS)[typeof role]];
      expect(row.level, `${role} / ${row.page}`).toBe(expected);
    }
  });
});

describe("ws_can and ws_my_access", () => {
  it("answers for a member from the role defaults", async () => {
    expect(await scalar("ok", MEMBER, "select public.ws_can('documents','edit') as ok")).toBe(true);
    expect(await scalar("ok", MEMBER, "select public.ws_can('pipeline','view') as ok")).toBe(true);
    expect(await scalar("ok", MEMBER, "select public.ws_can('pipeline','edit') as ok")).toBe(false);
    expect(await scalar("ok", MEMBER, "select public.ws_can('admin','view') as ok")).toBe(false);
  });

  it("answers for a partner from the role defaults", async () => {
    expect(
      await scalar("ok", PARTNER, "select public.ws_can('settings.members','view') as ok"),
    ).toBe(true);
    expect(
      await scalar("ok", PARTNER, "select public.ws_can('settings.members','edit') as ok"),
    ).toBe(false);
    expect(
      await scalar("ok", PARTNER, "select public.ws_can('settings.ai_providers','view') as ok"),
    ).toBe(false);
  });

  it("always says yes to the owner", async () => {
    for (const page of ["admin", "settings.ai_providers", "pipeline"]) {
      expect(await scalar("ok", OWNER, `select public.ws_can('${page}','edit') as ok`)).toBe(true);
    }
  });

  it("says no to an account with no member row", async () => {
    expect(await scalar("ok", OUTSIDER, "select public.ws_can('overview','view') as ok")).toBe(
      false,
    );
  });

  it("refuses an unknown level", async () => {
    await expect(as(MEMBER, "select public.ws_can('documents','write')")).rejects.toMatchObject({
      code: "22023",
    });
  });

  it("returns the caller's effective levels, one row per page", async () => {
    const rows = await as(MEMBER, "select page, level from public.ws_my_access() order by page");
    expect(rows).toHaveLength(8);
    const byPage = Object.fromEntries(rows.map((row) => [row.page, row.level]));
    expect(byPage.pipeline).toBe("view");
    expect(byPage.documents).toBe("edit");
    expect(byPage.admin).toBe("none");
  });
});

describe("per-person overrides", () => {
  it("wins over the role, and clearing it puts the role back", async () => {
    await asOwner(
      `select public.ws_set_user_permission('${MEMBER}', 'pipeline', 'edit', 'covering the draw')`,
    );

    expect(await scalar("ok", MEMBER, "select public.ws_can('pipeline','edit') as ok")).toBe(true);

    await asOwner(
      `select public.ws_set_user_permission('${MEMBER}', 'pipeline', null, 'draw is over')`,
    );

    expect(await scalar("ok", MEMBER, "select public.ws_can('pipeline','edit') as ok")).toBe(false);
    const rows = await db.query("select 1 from public.ws_user_permissions");
    expect(rows.rows).toHaveLength(0);
  });

  it("can lower a page to none and back", async () => {
    await asOwner(
      `select public.ws_set_user_permission('${MEMBER}', 'documents', 'none', 'on leave')`,
    );
    expect(await scalar("ok", MEMBER, "select public.ws_can('documents','view') as ok")).toBe(
      false,
    );

    await asOwner(
      `select public.ws_set_user_permission('${MEMBER}', 'documents', 'edit', 'back from leave')`,
    );
    expect(await scalar("ok", MEMBER, "select public.ws_can('documents','edit') as ok")).toBe(true);
  });

  it("cannot lower an owner", async () => {
    await expect(
      asOwner(`select public.ws_set_user_permission('${OWNER}', 'documents', 'none', 'trying it')`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses an account with no active member row", async () => {
    await expect(
      asOwner(
        `select public.ws_set_user_permission('${OUTSIDER}', 'documents', 'view', 'let them in')`,
      ),
    ).rejects.toMatchObject({ code: "P0002" });
  });

  it("needs a reason", async () => {
    await expect(
      asOwner(`select public.ws_set_user_permission('${MEMBER}', 'documents', 'view', 'no')`),
    ).rejects.toMatchObject({ code: "22023" });
  });
});

describe("the role matrix", () => {
  it("changes a role default and records it", async () => {
    await asOwner(
      `select public.ws_set_role_permission('member', 'overview', 'none', 'tighten it')`,
    );

    expect(await scalar("ok", MEMBER, "select public.ws_can('overview','view') as ok")).toBe(false);

    await asOwner(`select public.ws_set_role_permission('member', 'overview', 'edit', 'undo it')`);
    expect(await scalar("ok", MEMBER, "select public.ws_can('overview','edit') as ok")).toBe(true);

    const audit = await asOwner(
      `select action, reason from public.god_audit_list(50) where action = 'role_permission'`,
    );
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it("cannot lower the owner role", async () => {
    await expect(
      asOwner(`select public.ws_set_role_permission('owner', 'documents', 'view', 'trying it')`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses anyone who is not an owner", async () => {
    await expect(
      as(MEMBER, `select public.ws_set_role_permission('member', 'documents', 'view', 'a reason')`),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      as(
        MEMBER,
        `select public.ws_set_user_permission('${MEMBER}', 'documents', 'view', 'a reason')`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("only the owner may read the matrix", async () => {
    const matrix = await asOwner("select public.ws_permission_matrix() as m");
    const value = matrix[0]?.m as { roles: unknown[]; overrides: unknown[] };
    expect(value.roles).toHaveLength(24);
    expect(Array.isArray(value.overrides)).toBe(true);

    await expect(as(MEMBER, "select public.ws_permission_matrix()")).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("the narrowed policies", () => {
  it("hides a document from a person with no access and refuses their insert", async () => {
    const inserted = await asOwner(
      "insert into public.ws_docs (title) values ('Board minutes') returning id",
    );
    const docId = inserted[0]?.id;
    expect(typeof docId).toBe("string");

    await asOwner(
      `select public.ws_set_user_permission('${MEMBER}', 'documents', 'none', 'on leave')`,
    );

    const visible = await as(MEMBER, "select id from public.ws_docs");
    expect(visible).toHaveLength(0);

    await expect(
      as(MEMBER, "insert into public.ws_docs (title) values ('Not mine to add')"),
    ).rejects.toMatchObject({ code: "42501" });

    await asOwner(
      `select public.ws_set_user_permission('${MEMBER}', 'documents', 'edit', 'back again')`,
    );

    const back = await as(MEMBER, "select id from public.ws_docs");
    expect(back).toHaveLength(1);
  });

  it("lets a person with view read the pipeline but not write to it", async () => {
    await asOwner(
      "insert into public.ws_pipeline_cards (title, club_name) values ('A deal', 'IGCC')",
    );

    const cards = await as(MEMBER, "select id from public.ws_pipeline_cards");
    expect(cards).toHaveLength(1);

    await expect(
      as(
        MEMBER,
        "insert into public.ws_pipeline_cards (title, club_name) values ('B deal', 'IGCC')",
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps the delete rule: a member may not delete a card even with edit", async () => {
    await asOwner(
      `select public.ws_set_user_permission('${MEMBER}', 'pipeline', 'edit', 'the draw')`,
    );

    const before = await as(MEMBER, "select count(*)::int as n from public.ws_pipeline_cards");
    expect(before[0]?.n).toBe(1);

    await as(MEMBER, "delete from public.ws_pipeline_cards");
    const after = await as(MEMBER, "select count(*)::int as n from public.ws_pipeline_cards");
    expect(after[0]?.n).toBe(1);

    await asOwner(
      `select public.ws_set_user_permission('${MEMBER}', 'pipeline', null, 'draw is over')`,
    );
  });

  it("lets a member write a task they can edit", async () => {
    const rows = await as(
      MEMBER,
      "insert into public.ws_tasks (title) values ('Book the tee') returning id",
    );
    expect(rows).toHaveLength(1);
  });

  it("refuses a member the admin pages' data and the AI provider functions", async () => {
    await expect(as(MEMBER, "select public.ws_list_ai_providers()")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(asOwner("select public.ws_list_ai_providers()")).resolves.toHaveLength(1);
  });

  it("stops a non-owner adding a member", async () => {
    await expect(
      as(PARTNER, `select public.ws_add_member('new@example.test', 'member', 'New Member')`),
    ).rejects.toMatchObject({ code: "42501" });

    await asOwner(`select public.ws_add_member('new@example.test', 'member', 'New Member')`);
    const rows = await db.query<{ role: string }>(
      `select role from public.workspace_members where user_id = '${NEWCOMER}'`,
    );
    expect(rows.rows[0]?.role).toBe("member");
  });

  it("lets only an owner rename a member", async () => {
    await as(
      PARTNER,
      `update public.workspace_members set display_name = 'Pat P' where user_id = '${MEMBER}'`,
    );
    let row = await db.query<{ display_name: string }>(
      `select display_name from public.workspace_members where user_id = '${MEMBER}'`,
    );
    expect(row.rows[0]?.display_name).toBe("Mo Member");

    await asOwner(
      `update public.workspace_members set display_name = 'Mo M' where user_id = '${MEMBER}'`,
    );
    row = await db.query<{ display_name: string }>(
      `select display_name from public.workspace_members where user_id = '${MEMBER}'`,
    );
    expect(row.rows[0]?.display_name).toBe("Mo M");
  });
});

describe("grants and the paste-ready copy", () => {
  it("keeps the internal helpers out of reach", async () => {
    await expect(
      as(MEMBER, `select public.ws_effective_level('member', '${MEMBER}', 'documents')`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      as(MEMBER, "select public.ws_add_member_checked('a@b.test','member','A')"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(as(MEMBER, "select public.ws_require('documents','edit')")).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("keeps anon out", async () => {
    const rows = await db.query<{ anon_execute: boolean }>(
      "select has_function_privilege('anon', 'public.ws_my_access()', 'execute') as anon_execute",
    );
    expect(rows.rows[0]?.anon_execute).toBe(false);
  });

  it("carries the migration verbatim, so the two cannot drift", () => {
    const migrationText = migration("20261123000200_workspace_permissions.sql").trim();
    const applyText = readFileSync(
      fileURLToPath(new URL("../../../../../docs/permissions/apply-on-live.sql", import.meta.url)),
      "utf8",
    );
    expect(applyText).toContain(migrationText);
  });
});
