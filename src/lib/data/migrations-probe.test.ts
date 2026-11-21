import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The migration probe (scripts/migrations-probe.mjs, `pnpm migrations:probe`).
 *
 * Two fixtures cover the shape of a migration: the objects the extractor must find, and the noise it
 * must ignore (comments, function bodies, string literals, constraint clauses). The real folder then
 * proves the same thing across every migration in the repository, and that docs/migrations/probe.sql
 * is the file the script would write now.
 */

interface Migration {
  name: string;
  file: string;
  sql: string;
}

interface ProbeRow {
  migration: string;
  objects: string[];
}

interface ProbeModule {
  ALLOW_LIST: Record<string, string>;
  OUTPUT_FILE: string;
  readMigrations: () => Migration[];
  extractObjects: (sql: string) => string[];
  buildProbe: (migrations: Migration[]) => ProbeRow[];
  renderProbe: (rows: ProbeRow[]) => string;
}

const scriptUrl = new URL("../../../scripts/migrations-probe.mjs", import.meta.url).href;
let loaded: Promise<ProbeModule> | null = null;

function probe(): Promise<ProbeModule> {
  if (!loaded) loaded = import(/* @vite-ignore */ scriptUrl) as Promise<ProbeModule>;
  return loaded;
}

const OBJECTS_SQL = `
-- A comment that names create table public.ghost, which must not count.
/* and a block comment that names create index ghost_idx on public.ghost */
create table if not exists public.alpha (
  id uuid primary key,
  created_at timestamptz not null default now()
);

create type public.colour as enum ('blue', 'red');

create or replace function public.do_thing(
  p_id uuid,
  p_label text default 'x, y',
  p_flags text[] default array['a']::text[]
)
returns integer
language plpgsql
as $body$
begin
  -- A body that creates a table at run time is still not a schema object of this migration.
  create table public.not_real (id integer);
  return 1;
end;
$body$;

create unique index if not exists alpha_by_id on public.alpha (id);

create policy alpha_read on public.alpha for select using (true);

alter table public.alpha
  add column if not exists note text,
  add constraint alpha_note_length check (length(note) < 10);

alter table storage.buckets add column owner_note text;
`;

const GRANTS_SQL = `
-- Grants only: nothing is created, so there is no object name to look up.
revoke execute on function public.do_thing(uuid, text, text[]) from anon;
grant execute on function public.do_thing(uuid, text, text[]) to authenticated;
comment on column public.alpha.note is 'read by nobody';
update storage.buckets set file_size_limit = 5242880 where id = 'player-photos';
`;

describe("migration probe: the extractor", () => {
  it("finds every object kind a migration can create", async () => {
    const { extractObjects } = await probe();
    expect(extractObjects(OBJECTS_SQL)).toEqual([
      "table public.alpha",
      "type public.colour",
      "function public.do_thing(uuid, text, text[])",
      "column public.alpha.note",
      "column storage.buckets.owner_note",
      "index public.alpha_by_id",
      "policy public.alpha.alpha_read",
    ]);
  });

  it("reads comments, function bodies, string literals and constraints as noise", async () => {
    const { extractObjects } = await probe();
    const objects = extractObjects(OBJECTS_SQL);
    expect(objects).not.toContain("table public.ghost");
    expect(objects).not.toContain("index public.ghost_idx");
    expect(objects).not.toContain("table public.not_real");
    expect(objects).not.toContain("column public.alpha.constraint");
    expect(objects.join("\n")).not.toContain("default");
  });

  it("returns nothing for a migration that creates no object", async () => {
    const { extractObjects } = await probe();
    expect(extractObjects(GRANTS_SQL)).toEqual([]);
  });
});

describe("migration probe: the repository", () => {
  it("gives every migration an object to look up, or a stated reason it has none", async () => {
    const { ALLOW_LIST, extractObjects, readMigrations } = await probe();
    const migrations = readMigrations();
    expect(migrations.length).toBeGreaterThan(0);

    const unexplained: string[] = [];
    for (const migration of migrations) {
      const objects = extractObjects(migration.sql);
      const reason = ALLOW_LIST[migration.name];
      if (objects.length === 0 && !reason) unexplained.push(migration.name);
      if (objects.length > 0 && reason)
        unexplained.push(`${migration.name} (allow-listed but probed)`);
    }

    expect(unexplained).toEqual([]);
  });

  it("keeps the allow list honest: every entry is a real migration with a plain reason", async () => {
    const { ALLOW_LIST, readMigrations } = await probe();
    const names = new Set(readMigrations().map((migration) => migration.name));

    for (const [name, reason] of Object.entries(ALLOW_LIST)) {
      expect(names.has(name), `${name} is in the allow list but is not a migration`).toBe(true);
      expect(reason.trim().length, `${name} needs a reason`).toBeGreaterThan(0);
    }
  });

  it("writes docs/migrations/probe.sql, and the committed file is current", async () => {
    const { OUTPUT_FILE, buildProbe, renderProbe, readMigrations } = await probe();
    const committed = readFileSync(OUTPUT_FILE, "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(renderProbe(buildProbe(readMigrations())));
  });

  it("emits one read-only query with the four expected columns", async () => {
    const { OUTPUT_FILE, ALLOW_LIST } = await probe();
    const sql = readFileSync(OUTPUT_FILE, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    for (const write of ["insert", "update", "delete", "drop", "alter", "create", "grant", "do"]) {
      expect(sql).not.toMatch(new RegExp(`^\\s*${write}\\b`, "im"));
    }
    expect(sql.match(/;/g)).toHaveLength(1);
    expect(sql).toContain("order by migration");
    expect(sql).toContain("to_regclass");
    expect(sql).toContain("to_regprocedure");
    expect(sql).toContain("pg_policies");
    expect(sql).toContain("pg_indexes");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("pg_type");
    expect(sql).toContain("'applied'");
    expect(sql).toContain("'partly'");
    expect(sql).toContain("'missing'");

    for (const name of Object.keys(ALLOW_LIST)) {
      expect(sql).not.toContain(name);
    }
  });
});

describe("migration probe: output shape", () => {
  it("renders one row per probed migration, ordered by name", async () => {
    const { buildProbe, renderProbe } = await probe();
    const rows = buildProbe([
      { name: "20260101000000_b", file: "b.sql", sql: "create table public.b (id uuid);" },
      { name: "20260101000000_a", file: "a.sql", sql: "create table public.a (id uuid);" },
    ]);
    const sql = renderProbe(rows);

    expect(sql).toContain("'20260101000000_a', array[");
    expect(sql).toContain("'table public.a'\n    ]::text[]");
    // Postgres refuses a trailing comma inside an array literal, which the live run hit on 21 Nov.
    expect(sql).not.toMatch(/,\s*\]::text\[\]/);
    expect(sql.indexOf("20260101000000_a")).toBeLessThan(sql.indexOf("20260101000000_b"));
    expect(sql).toContain("order by migration");
  });
});
