import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The hotfix for a round with no rules version is guarded as text, like the other scoring
 * migrations. It replaces one function body and must not repeat or weaken the guard from
 * 20261114000300.
 */

const FILE = "20261115000300_correct_handicap_no_rules_version.sql";
const sql = readFileSync(join(process.cwd(), "supabase", "migrations", FILE), "utf8");
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const start = code.indexOf("create or replace function public.correct_handicap_snapshot(");
const end = start === -1 ? -1 : code.indexOf("$$;", start);
const correction = start === -1 || end === -1 ? "" : code.slice(start, end + 3);

describe("the no-rules-version handicap correction hotfix", () => {
  it("says it has not been applied and which file must run first", () => {
    const header = sql.slice(0, 1600);
    expect(header).toContain("NOT APPLIED");
    expect(header).toContain("20261114000300_correct_handicap_snapshot.sql");
  });

  it("replaces only the correction function", () => {
    expect(
      [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]),
    ).toEqual(["correct_handicap_snapshot"]);
    expect(code).not.toMatch(/handicap_snapshot_guard/);
  });

  it("records unconfirmed instead of refusing a round with no rules version", () => {
    expect(correction).toContain("v_rules := coalesce(nullif(btrim(v_rules), ''), 'unconfirmed');");
    expect(correction).not.toContain("The handicap rules version must be named");
  });

  it("keeps the role, status, freeze bypass, recalculation, audit and grant", () => {
    expect(correction).toContain("public.has_club_role(v_club, array['owner', 'organizer'])");
    expect(correction).toContain(
      "if v_status not in ('draft', 'open', 'scoring', 'provisional') then",
    );
    expect(correction).toContain("set_config('teeline.allow_frozen_snapshot', 'on', true)");
    expect(correction).toContain("set_config('teeline.allow_frozen_snapshot', 'off', true)");
    expect(correction).toContain("perform public.recalculate_player_results(v_round, v_player);");
    expect(correction).toContain("insert into public.scoring_audit");
    expect(code).toContain(
      "grant execute on function public.correct_handicap_snapshot(uuid, numeric, date, text) to authenticated;",
    );
    expect(code).not.toMatch(/grant execute [^;]*to anon/i);
  });
});
