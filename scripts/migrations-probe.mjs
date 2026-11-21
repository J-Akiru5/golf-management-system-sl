#!/usr/bin/env node
/**
 * Migration probe: say what the live database actually has.
 *
 * The owner applies migrations by pasting scripts into the Supabase SQL editor, so
 * `supabase_migrations.schema_migrations` does not record them and the repository cannot say what
 * the live project contains (health triage F6, desk F4). This script reads every file in
 * `supabase/migrations` in filename order, extracts the schema objects that file creates, and writes
 * `docs/migrations/probe.sql`: one read-only query the owner pastes into the SQL editor. It returns
 * one row per migration with `migration`, `objects_expected`, `objects_found` and `status`
 * (`applied`, `partly` or `missing`).
 *
 *   pnpm migrations:probe
 *   node scripts/migrations-probe.mjs
 *
 * It reads local files and writes one local file. It never connects to a database and never runs
 * SQL. The generated query is read-only: no DDL, no insert, no update, no do block.
 *
 * Objects it recognises (the ones a migration can be checked for):
 *   create table, create type, create [or replace] function (with its argument types),
 *   create [unique] index, create policy, alter table ... add column.
 *
 * A migration that creates none of those (grants, bucket settings, seed rows, comments, retired
 * no-ops) cannot be probed by object name. Each one must be named in ALLOW_LIST below with the plain
 * reason why, so a new migration that extracts to nothing stops the script instead of passing
 * silently.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
export const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
export const OUTPUT_FILE = join(ROOT, "docs", "migrations", "probe.sql");

/**
 * Migrations with no object the probe can look up, and why. Keep the reason plain and specific:
 * it is read by the next person who wonders why a file is missing from probe.sql.
 */
export const ALLOW_LIST = {
  "20261023000001_player_portal_grants": "grants only: three revoke execute statements",
  "20261030000000_revoke_anon_execute":
    "grants only: revoke anon and grant authenticated on existing functions",
  "20261032000000_photo_bucket_limits":
    "storage bucket settings only: file size limit and mime types",
  "20261105000200_flights_field_wide_classes": "one constraint dropped, nothing created",
  "20261108004000_public_leaderboard_sides": "retired no-op, kept so the version is on record",
  "20261123000600_timeline_permission": "three permission rows inserted, nothing created",
};

const TYPE_WORDS = new Set([
  "anyarray",
  "anyelement",
  "bigint",
  "bit",
  "bool",
  "boolean",
  "bytea",
  "char",
  "character",
  "cidr",
  "date",
  "decimal",
  "double",
  "event_trigger",
  "inet",
  "int",
  "int2",
  "int4",
  "int8",
  "integer",
  "interval",
  "json",
  "jsonb",
  "macaddr",
  "money",
  "name",
  "numeric",
  "oid",
  "real",
  "record",
  "regclass",
  "regprocedure",
  "regtype",
  "smallint",
  "text",
  "time",
  "timestamp",
  "timestamptz",
  "trigger",
  "uuid",
  "varbit",
  "varchar",
  "void",
  "xml",
]);

/** Keywords that follow `alter table ... add` without being a new column. */
const NOT_COLUMNS = new Set([
  "check",
  "constraint",
  "exclude",
  "foreign",
  "primary",
  "unique",
]);

const OBJECT_ORDER = ["table", "type", "function", "column", "index", "policy"];

const NAME = String.raw`[a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?`;

/**
 * Strip comments, single-quoted strings and dollar-quoted bodies (function bodies), keeping the
 * line breaks so nothing else shifts. Without this, a commented-out `create table` or a
 * `create table` inside a function body would be read as a real object.
 */
export function stripNoise(sql) {
  const text = sql.replace(/\r\n/g, "\n");
  const blank = (chunk) => chunk.replace(/[^\n]/g, " ");
  let out = "";
  let index = 0;

  while (index < text.length) {
    const rest = text.slice(index);
    const pair = rest.slice(0, 2);

    if (pair === "--") {
      const newline = text.indexOf("\n", index);
      const end = newline === -1 ? text.length : newline;
      out += blank(text.slice(index, end));
      index = end;
      continue;
    }

    if (pair === "/*") {
      const close = text.indexOf("*/", index + 2);
      const end = close === -1 ? text.length : close + 2;
      out += blank(text.slice(index, end));
      index = end;
      continue;
    }

    if (text[index] === "'") {
      let cursor = index + 1;
      while (cursor < text.length) {
        if (text[cursor] === "'") {
          if (text[cursor + 1] === "'") {
            cursor += 2;
            continue;
          }
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      out += blank(text.slice(index, cursor));
      index = cursor;
      continue;
    }

    if (text[index] === "$") {
      const tag = /^\$[a-z_][a-z0-9_]*\$|^\$\$/i.exec(rest);
      if (tag) {
        const marker = tag[0];
        const close = text.indexOf(marker, index + marker.length);
        const end = close === -1 ? text.length : close + marker.length;
        out += blank(text.slice(index, end));
        index = end;
        continue;
      }
    }

    out += text[index];
    index += 1;
  }

  return out;
}

function splitQualified(raw) {
  const dot = raw.indexOf(".");
  if (dot === -1) return { schema: "public", name: raw };
  return { schema: raw.slice(0, dot), name: raw.slice(dot + 1) };
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function closingParen(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function normaliseType(raw) {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s*\[\s*\]/g, "[]")
    .trim()
    .toLowerCase();
}

function argumentType(raw) {
  let arg = raw.replace(/\s+/g, " ").trim();
  arg = arg.replace(/^(?:in|out|inout|variadic)\s+/i, "");
  const atDefault = arg.search(/\sdefault\b/i);
  if (atDefault !== -1) arg = arg.slice(0, atDefault);
  if (!arg) return null;

  const tokens = arg.split(" ");
  const first = tokens[0] ?? "";
  if (tokens.length === 1) return normaliseType(arg);
  if (TYPE_WORDS.has(first.toLowerCase().replace(/\[\]$/, "")) || first.includes(".")) {
    return normaliseType(arg);
  }
  return normaliseType(tokens.slice(1).join(" "));
}

function argumentTypes(list) {
  return splitTopLevel(list)
    .map(argumentType)
    .filter((type) => type !== null);
}

/**
 * Every object a migration creates, as a probe token such as `table public.clubs` or
 * `function public.is_club_member(uuid)`. Duplicates inside one file collapse, because the probe
 * asks "does this exist", not "how many times was it written".
 */
export function extractObjects(sql) {
  const text = stripNoise(sql);
  const tokens = new Set();

  const addTable = (raw) => {
    const { schema, name } = splitQualified(raw);
    tokens.add(`table ${schema}.${name}`);
  };

  for (const match of text.matchAll(
    new RegExp(
      String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:unlogged\s+|temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?(${NAME})`,
      "gi",
    ),
  )) {
    addTable(match[1]);
  }

  for (const match of text.matchAll(new RegExp(String.raw`\bcreate\s+type\s+(${NAME})`, "gi"))) {
    const { schema, name } = splitQualified(match[1]);
    tokens.add(`type ${schema}.${name}`);
  }

  const functionStart = new RegExp(
    String.raw`\bcreate\s+(?:or\s+replace\s+)?function\s+(${NAME})\s*\(`,
    "gi",
  );
  for (;;) {
    const match = functionStart.exec(text);
    if (!match) break;
    const open = match.index + match[0].length - 1;
    const close = closingParen(text, open);
    if (close === -1) break;
    const { schema, name } = splitQualified(match[1]);
    const types = argumentTypes(text.slice(open + 1, close));
    tokens.add(`function ${schema}.${name}(${types.join(", ")})`);
    functionStart.lastIndex = close + 1;
  }

  for (const match of text.matchAll(
    new RegExp(
      String.raw`\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(${NAME})`,
      "gi",
    ),
  )) {
    const { schema, name } = splitQualified(match[1]);
    tokens.add(`index ${schema}.${name}`);
  }

  for (const match of text.matchAll(
    new RegExp(String.raw`\bcreate\s+policy\s+(${NAME})\s+on\s+(${NAME})`, "gi"),
  )) {
    const policy = match[1];
    const table = splitQualified(match[2]);
    const policyName = policy.includes(".") ? policy.slice(policy.indexOf(".") + 1) : policy;
    tokens.add(`policy ${table.schema}.${table.name}.${policyName}`);
  }

  for (const match of text.matchAll(
    new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${NAME})([^;]*)`, "gi"),
  )) {
    const table = splitQualified(match[1]);
    const clause = match[2] ?? "";
    for (const added of clause.matchAll(
      /\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_$]*)/gi,
    )) {
      const column = added[1];
      if (NOT_COLUMNS.has(column.toLowerCase())) continue;
      tokens.add(`column ${table.schema}.${table.name}.${column}`);
    }
  }

  return [...tokens]
    .map((token) => {
      const [kind] = token.split(" ");
      return { token, kind };
    })
    .sort((a, b) => {
      const rank = OBJECT_ORDER.indexOf(a.kind) - OBJECT_ORDER.indexOf(b.kind);
      return rank === 0 ? a.token.localeCompare(b.token) : rank;
    })
    .map((object) => object.token);
}

/** Every migration file in filename order, which is the order the owner applies them in. */
export function readMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      name: file.replace(/\.sql$/, ""),
      file,
      sql: readFileSync(join(dir, file), "utf8"),
    }));
}

export function buildProbe(migrations) {
  const rows = migrations.map((migration) => ({
    migration: migration.name,
    objects: extractObjects(migration.sql),
  }));
  return rows
    .filter((row) => row.objects.length > 0)
    .sort((a, b) => a.migration.localeCompare(b.migration));
}

function quote(value) {
  return value.replace(/'/g, "''");
}

function renderRow(row) {
  // No trailing comma: Postgres refuses `array['a', 'b', ]`.
  const objects = row.objects.map((object) => `        '${quote(object)}'`).join(",\n");
  return `    ('${quote(row.migration)}', array[\n${objects}\n    ]::text[])`;
}

export function renderProbe(rows) {
  const values = rows.map(renderRow).join(",\n");

  return `-- TeeLine migration probe. Read-only.
--
-- Generated by \`pnpm migrations:probe\` from supabase/migrations. Do not edit this file by hand;
-- change the generator and run it again.
--
-- Paste the whole file into the Supabase SQL editor and press Run. It reads the catalogue and
-- changes nothing: no DDL, no insert, no update, no do block.
--
-- One row per migration, in filename order:
--   objects_expected  how many schema objects that migration creates
--   objects_found     how many of them this database has now
--   status            applied (all found), partly (some found), missing (none found)
--
-- Migrations that create no object the catalogue can be asked about (grants, settings, seed rows,
-- comments, retired no-ops) are not listed here. docs/migrations/README.md names them and why.
--
-- Record the result in docs/PLAN.md, "Database scripts the owner runs".

with expected (migration, objects) as (
  values
${values}
),
counted as (
  select
    e.migration,
    count(o.obj) as objects_expected,
    count(*) filter (where probe_row.found) as objects_found
  from expected e
  left join lateral unnest(e.objects) as o(obj) on true
  left join lateral (
    select case
      when o.obj like 'table %' then
        to_regclass(substr(o.obj, 7)) is not null
      when o.obj like 'function %' then
        to_regprocedure(substr(o.obj, 10)) is not null
      when o.obj like 'index %' then
        exists (
          select 1
          from pg_indexes i
          where i.schemaname = split_part(substr(o.obj, 7), '.', 1)
            and i.indexname = split_part(substr(o.obj, 7), '.', 2)
        )
      when o.obj like 'type %' then
        exists (
          select 1
          from pg_type t
          join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = split_part(substr(o.obj, 6), '.', 1)
            and t.typname = split_part(substr(o.obj, 6), '.', 2)
        )
      when o.obj like 'column %' then
        exists (
          select 1
          from information_schema.columns col
          where col.table_schema = split_part(substr(o.obj, 8), '.', 1)
            and col.table_name = split_part(substr(o.obj, 8), '.', 2)
            and col.column_name = split_part(substr(o.obj, 8), '.', 3)
        )
      when o.obj like 'policy %' then
        exists (
          select 1
          from pg_policies p
          where p.schemaname = split_part(substr(o.obj, 8), '.', 1)
            and p.tablename = split_part(substr(o.obj, 8), '.', 2)
            and p.policyname = split_part(substr(o.obj, 8), '.', 3)
        )
    end as found
  ) probe_row on true
  group by e.migration, e.objects
)
select
  migration,
  objects_expected,
  objects_found,
  case
    when objects_found = 0 then 'missing'
    when objects_found = objects_expected then 'applied'
    else 'partly'
  end as status
from counted
order by migration;
`;
}

function main() {
  const migrations = readMigrations();
  const rows = buildProbe(migrations);
  const probed = new Set(rows.map((row) => row.migration));
  const empty = migrations.map((m) => m.name).filter((name) => !probed.has(name));
  const problems = [];

  for (const name of empty) {
    if (!ALLOW_LIST[name]) problems.push(`${name}: creates no object and is not in ALLOW_LIST`);
  }
  for (const name of Object.keys(ALLOW_LIST)) {
    if (!probed.has(name) && !empty.includes(name)) {
      problems.push(`${name}: listed in ALLOW_LIST but there is no such migration`);
    }
    if (probed.has(name)) {
      problems.push(`${name}: listed in ALLOW_LIST but it does create objects now`);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`migrations:probe: ${problem}`);
    process.exit(1);
  }

  mkdirSync(join(ROOT, "docs", "migrations"), { recursive: true });
  writeFileSync(OUTPUT_FILE, renderProbe(rows), "utf8");

  const objects = rows.reduce((total, row) => total + row.objects.length, 0);
  console.log(
    `migrations:probe: ${migrations.length} migrations, ${rows.length} probed, ${objects} objects, ${empty.length} listed in the allow list`,
  );
  console.log(`migrations:probe: wrote docs/migrations/probe.sql`);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main();
