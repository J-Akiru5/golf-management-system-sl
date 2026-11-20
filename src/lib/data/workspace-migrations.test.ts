import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase/migrations");
const files = readdirSync(dir)
  .filter((name) => name.startsWith("202611200") && name.includes("workspace"))
  .sort();
const sql = Object.fromEntries(files.map((f) => [f, readFileSync(join(dir, f), "utf8")]));
const all = Object.values(sql).join("\n");

const TABLES = [
  "workspace_members",
  "ws_docs",
  "ws_doc_states",
  "ws_doc_snapshots",
  "ws_pipeline_cards",
  "ws_tasks",
  "ws_task_comments",
];

describe("workspace migrations", () => {
  it("are the four expected files, in order", () => {
    expect(files).toEqual([
      "20261120000100_workspace_members.sql",
      "20261120000200_workspace_docs.sql",
      "20261120000300_workspace_pipeline_and_tasks.sql",
      "20261120000400_workspace_realtime.sql",
    ]);
  });

  it.each(TABLES)("%s has row level security and no anon access", (table) => {
    expect(all).toContain(`alter table public.${table} enable row level security`);
    expect(all).toContain(`revoke all on table public.${table} from public, anon`);
    expect(all).not.toMatch(new RegExp(`grant[^;]*on table public\\.${table}[^;]*to[^;]*anon`));
  });

  it("never grants anything to anon", () => {
    expect(all).not.toMatch(/grant[^;]*\bto\b[^;]*\banon\b/i);
  });

  it("pins search_path on every security definer function", () => {
    const functions = all.split(/create (?:or replace )?function /).slice(1);
    for (const body of functions) {
      if (/security definer/.test(body.split("$$")[0] ?? "")) {
        expect(body.split("$$")[0]).toContain("set search_path = ''");
      }
    }
  });

  it("locks every function away from public and anon", () => {
    const names = [...all.matchAll(/create function public\.(\w+)\(/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      expect(all).toMatch(new RegExp(`revoke all on function public\\.${name}\\(`));
    }
  });

  it("limits deleting content to owner and partner", () => {
    for (const table of ["ws_docs", "ws_doc_snapshots", "ws_pipeline_cards", "ws_tasks"]) {
      const policy = all.match(new RegExp(`create policy ${table}_delete[\\s\\S]*?;`));
      expect(policy?.[0], table).toContain("array['owner', 'partner']");
    }
  });

  it("never uses the service role", () => {
    expect(all).not.toMatch(/service_role/);
  });

  it("only lets clients send on document channels", () => {
    const send = all.match(/create policy ws_members_send[\s\S]*?;/)?.[0] ?? "";
    expect(send).toContain("like 'ws:doc:%'");
    expect(send).not.toContain("'ws:board'");
    expect(send).not.toContain("'ws:tasks'");
  });

  it("keeps a realtime failure from blocking a save", () => {
    expect(all).toContain("exception when others then");
  });
});
