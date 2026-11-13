import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_HANDICAP_SOURCE } from "../event-rules";

/**
 * There is no database in this repository, so the card handicap migration is guarded as text. These
 * tests do not run SQL. They check that the file stays additive, keeps the role check, the freeze
 * and the rule the app relies on, and says it has not been applied.
 */

const FILE = "20261114000100_card_handicap_snapshot.sql";
const sql = readFileSync(join(process.cwd(), "supabase", "migrations", FILE), "utf8");
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("the card handicap migration", () => {
  it("says it has not been applied and names owner approval", () => {
    const header = sql.slice(0, 700);
    expect(header).toContain("NOT APPLIED");
    expect(header).toMatch(/owner must approve/i);
  });

  it("is additive: one new function and no change to a table, constraint, trigger or policy", () => {
    expect(
      [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]),
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

  it("is a security definer function with an empty search path", () => {
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

  it("reads the box the way the app does: blank is 0, a plain number only, the decimal dropped", () => {
    expect(code).toContain("if v_text = '' then");
    expect(code).toContain("v_value := 0;");
    expect(code).toContain("'^[0-9]+(\\.[0-9]+)?$'");
    expect(code).toContain("v_playing := floor(v_value)::smallint;");
    expect(code).toContain("v_index := trunc(v_value, 1);");
    expect(code).toContain("> 54");
  });

  it("stores the same number as course and playing handicap at a full allowance", () => {
    expect(code).toMatch(/1, 'single',\s+v_playing, v_playing,/);
  });

  it("marks the snapshot with the source text the app looks for", () => {
    expect(code).toContain(`'${CARD_HANDICAP_SOURCE}'`);
  });

  it("leaves a snapshot with the same playing handicap alone", () => {
    expect(code).toContain("if v_id is not null and v_previous = v_playing then");
  });

  it("relies on the existing freeze instead of working around it", () => {
    // It updates through `on conflict`, so the existing before-update trigger still decides.
    expect(code).toContain("on conflict (round_id, round_entry_id) do update");
    expect(code).not.toMatch(/disable\s+trigger/i);
  });

  it("writes one scoring audit row", () => {
    expect(code).toContain("insert into public.scoring_audit");
    expect(code).toContain("'handicap_snapshot', v_id, 'saved'");
  });
});
