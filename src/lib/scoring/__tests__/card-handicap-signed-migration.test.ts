import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_HANDICAP_SOURCE } from "../event-rules";

/**
 * There is no database in this repository, so the signed card handicap migration is guarded as
 * text. These tests do not run SQL. They check that the file replaces one function and nothing
 * else, keeps the role check, the freeze and the audit row, widens only the accepted number, and
 * says it has not been applied.
 */

const FILE = "20261115000100_card_handicap_signed_handicap.sql";
const sql = readFileSync(join(process.cwd(), "supabase", "migrations", FILE), "utf8").replace(
  /\r\n/g,
  "\n",
);
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("the signed card handicap migration", () => {
  it("says it has not been applied and names owner approval", () => {
    const header = sql.slice(0, 900);
    expect(header).toContain("NOT APPLIED");
    expect(header).toMatch(/owner must approve/i);
  });

  it("replaces the one function and changes no table, constraint, trigger or policy", () => {
    expect(
      [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]),
    ).toEqual(["save_card_handicap_snapshot"]);
    for (const forbidden of [
      /\balter\s+table\b/i,
      /\bdrop\b/i,
      /\bcreate\s+table\b/i,
      /\bcreate\s+trigger\b/i,
      /\bcreate\s+policy\b/i,
      /\btruncate\b/i,
      /\bdelete\s+from\b/i,
      /\bupdate\s+public\./i,
    ]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it("keeps the signature, the security definer and the empty search path", () => {
    expect(code).toContain(
      "create or replace function public.save_card_handicap_snapshot(\n  p_round_entry uuid,\n  p_card_handicap text default null\n)",
    );
    expect(code).toContain("security definer");
    expect(code).toContain("set search_path = ''");
  });

  it("lets only club staff call it, and nobody anonymous", () => {
    expect(code).toContain("public.has_club_role(v_club, array['owner', 'organizer', 'desk'])");
    expect(code).toContain(
      "revoke all on function public.save_card_handicap_snapshot(uuid, text) from public, anon;",
    );
    expect(code).toContain(
      "grant execute on function public.save_card_handicap_snapshot(uuid, text) to authenticated;",
    );
  });

  it("accepts a negative whole number and keeps every other reading the same", () => {
    expect(code).toContain("if v_text = '' then");
    expect(code).toContain("v_value := 0;");
    // The only widening: an optional leading minus.
    expect(code).toContain("'^-?[0-9]+(\\.[0-9]+)?$'");
    expect(code).toContain("v_value < -20");
    expect(code).toContain("v_value > 54");
    expect(code).toContain("v_playing := floor(v_value)::smallint;");
    expect(code).toContain("v_index := trunc(v_value, 1);");
  });

  it("keeps the snapshot shape the app reads: card source, one number, full allowance", () => {
    expect(code).toContain(`'${CARD_HANDICAP_SOURCE}'`);
    expect(code).toMatch(/1, 'single',\s+v_playing, v_playing,/);
    expect(code).toContain("if v_id is not null and v_previous = v_playing then");
  });

  it("relies on the existing freeze instead of working around it", () => {
    expect(code).toContain("on conflict (round_id, round_entry_id) do update");
    expect(code).not.toMatch(/disable\s+trigger/i);
  });

  it("still writes one scoring audit row", () => {
    expect(code).toContain("insert into public.scoring_audit");
    expect(code).toContain("'handicap_snapshot', v_id, 'saved'");
  });
});
