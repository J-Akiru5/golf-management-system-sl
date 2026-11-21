import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationFile = "supabase/migrations/20261123000400_tournament_presets.sql";
// The files are stored with CRLF, so the checks below read them with plain newlines.
const sql = readFileSync(join(root, migrationFile), "utf8").replace(/\r\n/g, "\n");
const applyScript = readFileSync(join(root, "docs/presets/apply-on-live.sql"), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** The body of one function, from its `create function` to the end of the file. */
function functionBody(name: string): string {
  const index = sql.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`));
  expect(index, name).toBeGreaterThanOrEqual(0);
  const rest = sql.slice(index);
  const next = rest.slice(1).search(/create (?:or replace )?function /);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("tournament presets migration", () => {
  it("creates the preset table with the columns the desk reads", () => {
    expect(sql).toContain("create table public.tournament_presets");
    for (const column of ["id uuid primary key", "club_id uuid not null", "name text not null"]) {
      expect(sql).toContain(column);
    }
    expect(sql).toMatch(/settings jsonb not null/);
    expect(sql).toMatch(/created_by uuid/);
    expect(sql).toMatch(/created_at timestamptz not null default now\(\)/);
    expect(sql).toMatch(/updated_at timestamptz not null default now\(\)/);
    expect(sql).toMatch(/description text/);
  });

  it("is readable by members and writable only by an owner or organizer", () => {
    expect(sql).toContain("alter table public.tournament_presets enable row level security");
    expect(sql).toMatch(
      /create policy tournament_presets_read on public\.tournament_presets\s+for select to authenticated using \(public\.is_club_member\(club_id\)\)/,
    );
    expect(sql).toMatch(
      /create policy tournament_presets_manager_write on public\.tournament_presets\s+for all to authenticated\s+using \(public\.has_club_role\(club_id, array\['owner', 'organizer'\]\)\)/,
    );
  });

  it("never reaches anon", () => {
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\banon\b/i);
    expect(sql).toContain("revoke all on table public.tournament_presets from public, anon");
    for (const name of [
      "save_tournament_preset",
      "apply_tournament_preset",
      "seed_preset_from_tournament",
      "preset_settings_problem",
    ]) {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`),
      );
    }
  });

  it("pins the search path on every security definer function", () => {
    const bodies = sql.split(/create (?:or replace )?function /).slice(1);
    for (const body of bodies) {
      const head = body.split("$$")[0] ?? "";
      if (/security definer/.test(head)) expect(head).toContain("set search_path = ''");
    }
  });

  it("applies a preset through the same guarded path as the Settings screen", () => {
    const body = functionBody("apply_tournament_preset");
    expect(body).toContain("public.save_event_setup(");
    expect(body).toContain("has_club_role(v_club, array['owner', 'organizer'])");
    // The preset is read and judged, never written: applying it must not change the standard.
    expect(body).not.toMatch(/insert into public\.tournament_presets/);
    expect(body).not.toMatch(/update public\.tournament_presets/);
    expect(body).not.toMatch(/delete from public\.tournament_presets/);
  });

  it("writes the event's afternoon start and the day session starts that save_event_setup does not", () => {
    const body = functionBody("apply_tournament_preset");
    expect(body).toContain("set pm_first_tee_time =");
    expect(body).toContain("update public.tournament_days");
    expect(body).toContain("start_time = v_morning");
    expect(body).toContain("pm_start_time = v_afternoon");
  });

  it("refuses a preset whose stored rules no longer pass", () => {
    const body = functionBody("apply_tournament_preset");
    expect(body).toContain("preset_settings_problem(v_settings)");
    expect(body).toContain("raise exception 'This preset cannot be applied: %'");
  });

  it("saves a preset only after the same check", () => {
    const body = functionBody("save_tournament_preset");
    expect(body).toContain("preset_settings_problem(p_settings)");
    expect(body).toContain("has_club_role(p_club, array['owner', 'organizer'])");
    expect(body).toContain("A preset needs a name");
  });

  it("seeds from the event's own rows rather than typed-in numbers", () => {
    const body = functionBody("seed_preset_from_tournament");
    expect(body).toContain("from public.tees t");
    expect(body).toContain("from public.categories c");
    expect(body).toContain("from public.flights f");
    expect(body).toContain("from public.tournament_days d");
    // It must not store numbers of its own: every value comes from a table or a column.
    expect(body).not.toMatch(/'rating',\s*\d/);
    expect(body).not.toMatch(/'slope',\s*\d/);
    expect(body).not.toMatch(/'par',\s*\d/);
  });

  it("reads a playing day's start from the day row, not from a fixed clock", () => {
    const body = functionBody("seed_preset_from_tournament");
    expect(body).toContain("to_char(d.start_time, 'HH24:MI')");
    expect(body).toContain("to_char(d.pm_start_time, 'HH24:MI')");
    expect(body).not.toMatch(/'06:30'/);
    expect(body).not.toMatch(/'12:30'/);
  });

  it("has a self-check that probes the validator", () => {
    expect(sql).toMatch(/do \$\$/);
    expect(sql).toContain("preset_settings_problem(v_good)");
    expect(sql).toContain("raise exception 'expected 5 preset functions");
    expect(sql).toContain("raise exception 'row level security is not on for tournament_presets'");
  });

  it("is shipped as one paste-ready transaction", () => {
    expect(applyScript.trimStart().startsWith("--")).toBe(true);
    expect(applyScript).toContain("\nbegin;\n");
    expect(applyScript).toContain("\ncommit;\n");
    expect(applyScript.indexOf("\nbegin;\n")).toBeLessThan(applyScript.indexOf("create table"));
    expect(applyScript.indexOf("create table")).toBeLessThan(applyScript.indexOf("\ncommit;\n"));
    expect(applyScript).toContain("create table public.tournament_presets");
    expect(applyScript).toContain("create or replace function public.apply_tournament_preset");
  });
});
