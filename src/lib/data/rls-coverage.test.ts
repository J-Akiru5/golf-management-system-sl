import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every table in the public schema must have row level security switched on in the migrations.
 * A table without it is readable and writable by any role that holds a grant, so this test reads
 * the migrations rather than trusting a review to notice.
 *
 * Both ways the migrations enable it are recognised: a direct `alter table ... enable row level
 * security`, and the loop over a list of table names in 20261017000000_init.sql.
 */

const dir = join(process.cwd(), "supabase/migrations");

/** A comment may mention a table; only statements count. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const migrations = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => stripComments(readFileSync(join(dir, name), "utf8")));

const created = new Set<string>();
for (const sql of migrations) {
  for (const match of sql.matchAll(
    /create table(?: if not exists)? public\.([a-z_][a-z0-9_]*)/gi,
  )) {
    if (match[1]) created.add(match[1]);
  }
}

const enabled = new Set<string>();
for (const sql of migrations) {
  for (const match of sql.matchAll(
    /alter table public\.([a-z_][a-z0-9_]*)\s+enable row level security/gi,
  )) {
    if (match[1]) enabled.add(match[1]);
  }

  for (const block of sql.matchAll(/do \$\$([\s\S]*?)\$\$/g)) {
    const doBlock = block[1] ?? "";
    if (!/enable row level security/i.test(doBlock)) continue;
    const list = doBlock.match(/array\[([\s\S]*?)\]/i);
    if (!list) continue;
    for (const name of (list[1] ?? "").matchAll(/'([a-z_][a-z0-9_]*)'/g)) {
      if (name[1]) enabled.add(name[1]);
    }
  }
}

/**
 * Tables that genuinely need no row level security. Each entry must carry the reason. It is empty:
 * every table in this project is either exposed through a policy or closed to every client role and
 * reached only through a security definer function.
 */
const ALLOWED_WITHOUT_RLS: Readonly<Record<string, string>> = {};

describe("row level security coverage", () => {
  it("finds the tables the migrations create", () => {
    // Guards the parse itself: a broken pattern must fail loudly, not pass by finding nothing.
    expect(created.size).toBeGreaterThan(40);
    expect(created.has("registrations")).toBe(true);
    expect(created.has("public_feedback")).toBe(true);
  });

  it("recognises the loop in the init migration", () => {
    expect(enabled.has("registrations")).toBe(true);
    expect(enabled.has("clubs")).toBe(true);
  });

  it("enables row level security on every public table", () => {
    const missing = [...created]
      .filter((table) => !enabled.has(table) && !(table in ALLOWED_WITHOUT_RLS))
      .sort();

    expect(missing, `Enable row level security on: ${missing.join(", ") || "(none)"}`).toEqual([]);
  });

  it("keeps the allow list honest", () => {
    for (const [table, reason] of Object.entries(ALLOWED_WITHOUT_RLS)) {
      expect(
        created.has(table),
        `${table} is allowed without row level security but is not created`,
      ).toBe(true);
      expect(reason.trim().length, `${table} needs a reason`).toBeGreaterThan(10);
    }
  });
});
