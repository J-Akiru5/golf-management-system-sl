import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The playing-handicap cap migration is guarded as text, like the other scoring migrations. It
 * replaces the two functions that work a playing handicap out from an index, changes one step in
 * each, and must not weaken anything else in them.
 */

const FILE = "20261115000400_cap_playing_handicap.sql";
const sql = readFileSync(join(process.cwd(), "supabase", "migrations", FILE), "utf8");
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function body(name: string): string {
  const start = code.indexOf(`create or replace function public.${name}(`);
  const end = start === -1 ? -1 : code.indexOf("$$;", start);
  return start === -1 || end === -1 ? "" : code.slice(start, end + 3);
}
const save = body("save_handicap_snapshot");
const correct = body("correct_handicap_snapshot");

describe("the playing handicap cap migration", () => {
  it("says it has not been applied and which file must run first", () => {
    const header = sql.slice(0, 1800);
    expect(header).toContain("NOT APPLIED");
    expect(header).toContain("20261115000300_correct_handicap_no_rules_version.sql");
  });

  it("replaces only the two functions that work a playing handicap from an index", () => {
    expect(
      [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]),
    ).toEqual(["save_handicap_snapshot", "correct_handicap_snapshot"]);
    expect(code).not.toMatch(/\b(create|alter|drop) table\b/i);
    expect(code).not.toMatch(/\bupdate public\./i);
  });

  it("holds the playing handicap to the event maximum in both, after the tee formula", () => {
    for (const fn of [save, correct]) {
      expect(fn).toContain("v_playing := least(v_playing, floor(v_max_index)::smallint);");
      const formula = fn.indexOf("floor(v_raw * v_allowance + 0.5)::smallint");
      const cap = fn.indexOf("v_playing := least(v_playing");
      expect(formula).toBeGreaterThan(-1);
      expect(cap).toBeGreaterThan(formula);
    }
  });

  it("still caps the index first, and reads the maximum from the tournament", () => {
    for (const fn of [save, correct]) {
      expect(fn).toContain("least(v_on_file, v_max_index)");
      expect(fn).toContain("select max_index into v_max_index");
    }
  });

  it("keeps the roles, the freeze bypass, the recalculation, the audit and the grants", () => {
    expect(save).toContain("public.has_club_role(v_club, array['owner', 'organizer', 'desk'])");
    expect(save).toContain("if v_status not in ('draft', 'open') then");
    expect(correct).toContain("public.has_club_role(v_club, array['owner', 'organizer'])");
    expect(correct).toContain(
      "if v_status not in ('draft', 'open', 'scoring', 'provisional') then",
    );
    expect(correct).toContain("set_config('teeline.allow_frozen_snapshot', 'on', true)");
    expect(correct).toContain("set_config('teeline.allow_frozen_snapshot', 'off', true)");
    expect(correct).toContain("perform public.recalculate_player_results(v_round, v_player);");
    expect(correct).toContain("v_rules := coalesce(nullif(btrim(v_rules), ''), 'unconfirmed');");
    expect(save).toContain("insert into public.scoring_audit");
    expect(correct).toContain("insert into public.scoring_audit");
    expect(code).toContain(
      "grant execute on function public.correct_handicap_snapshot(uuid, numeric, date, text) to authenticated;",
    );
    expect(code).not.toMatch(/grant execute [^;]*to anon/i);
    for (const fn of [save, correct]) {
      expect(fn).toContain("security definer");
      expect(fn).toContain("set search_path = ''");
    }
  });
});
