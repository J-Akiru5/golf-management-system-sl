import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORRECTED_HANDICAP_SOURCE } from "../event-rules";

/**
 * There is no database in this repository, so the snapshot-correction migration is guarded as text.
 * These tests do not run SQL. They check that the file stays additive apart from the guard body,
 * keeps the freeze for every other caller, and says it has not been applied.
 */

const FILE = "20261114000300_correct_handicap_snapshot.sql";
const sql = readFileSync(join(process.cwd(), "supabase", "migrations", FILE), "utf8");
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function functionBlock(name: string): string {
  const start = code.indexOf(`create or replace function public.${name}(`);
  if (start === -1) throw new Error(`public.${name} was not found`);
  const end = code.indexOf("$$;", start);
  if (end === -1) throw new Error(`The body of public.${name} was not closed`);
  return code.slice(start, end + 3);
}

const guard = functionBlock("handicap_snapshot_guard");
const correction = functionBlock("correct_handicap_snapshot");

describe("the handicap snapshot correction migration header", () => {
  it("says it has not been applied and names owner approval by name", () => {
    const header = sql.slice(0, 1600);
    expect(header).toContain("NOT APPLIED");
    expect(header).toMatch(/owner must approve/i);
    expect(header).toMatch(/by name/i);
  });

  it("says plainly that it is additive except for the guard body", () => {
    const header = sql.slice(0, 1600);
    expect(header).toMatch(/additive except/i);
    expect(header).toContain("handicap_snapshot_guard");
  });
});

describe("what the migration replaces", () => {
  it("replaces the guard and adds one function, and nothing else", () => {
    expect(
      [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((match) => match[1]),
    ).toEqual(["handicap_snapshot_guard", "correct_handicap_snapshot"]);
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

  it("keeps the original refusal and checks the setting before lifting it", () => {
    expect(guard).toContain("r.status not in ('draft', 'open')");
    expect(guard).toContain("current_setting('teeline.allow_frozen_snapshot', true)");
    expect(guard).toContain("<> 'on'");
    expect(guard).toContain("raise exception 'A handicap snapshot is frozen once scoring starts'");
    expect(guard).toContain("using errcode = '23514'");
  });

  it("stays a security definer with an empty search path", () => {
    expect(guard).toContain("security definer");
    expect(guard).toContain("set search_path = ''");
  });
});

describe("the correction function", () => {
  it("is a security definer returning jsonb with an empty search path", () => {
    expect(correction).toContain("returns jsonb");
    expect(correction).toContain("security definer");
    expect(correction).toContain("set search_path = ''");
  });

  it("lets an owner or organizer call it, and never the desk", () => {
    expect(correction).toContain("public.has_club_role(v_club, array['owner', 'organizer'])");
    expect(correction).not.toContain("'desk'");
  });

  it("refuses a final round and allows the four statuses before it", () => {
    expect(correction).toContain(
      "if v_status not in ('draft', 'open', 'scoring', 'provisional') then",
    );
    expect(correction).toContain(
      "'The round is final, so its handicap snapshot cannot be corrected'",
    );
  });

  it("requires a reason of three characters, an index from -10 to 54 and an effective date", () => {
    expect(correction).toContain("length(btrim(p_reason)) < 3");
    expect(correction).toContain("p_index < -10 or p_index > 54");
    expect(correction).toContain("p_effective is null");
  });

  it("caps at the tournament maximum and computes the handicaps as the save path does", () => {
    expect(correction).toContain("select max_index into v_max_index");
    expect(correction).toContain("when v_max_index is not null then least(v_on_file, v_max_index)");
    expect(correction).toContain("v_on_file := round(p_index, 1);");
    expect(correction).toContain("v_course := floor(v_raw + 0.5)::smallint;");
    expect(correction).toContain(
      "when v_rounding = 'whs' then floor(v_course * v_allowance + 0.5)::smallint",
    );
  });

  it("sets the bypass, upserts the snapshot, then sets the bypass back", () => {
    const on = correction.indexOf("set_config('teeline.allow_frozen_snapshot', 'on', true)");
    const upsert = correction.indexOf("on conflict (round_id, round_entry_id) do update");
    const off = correction.indexOf("set_config('teeline.allow_frozen_snapshot', 'off', true)");

    expect(on).toBeGreaterThan(-1);
    expect(upsert).toBeGreaterThan(on);
    expect(off).toBeGreaterThan(upsert);
    expect(correction).not.toMatch(/disable\s+trigger/i);
  });

  it("marks the snapshot as a manual correction with the new effective date", () => {
    expect(correction).toContain(`'${CORRECTED_HANDICAP_SOURCE}', p_effective`);
  });

  it("recalculates that player's result after the snapshot changes", () => {
    expect(correction).toContain("perform public.recalculate_player_results(v_round, v_player);");
  });

  it("writes one audit row naming who, why, the old values and the new ones", () => {
    expect([...correction.matchAll(/insert into public\.scoring_audit/g)]).toHaveLength(1);
    expect(correction).toContain(
      "'handicap_snapshot', v_id, 'corrected', (select auth.uid()), p_reason",
    );
    expect(correction).toContain("'previousIndex', v_previous_index");
    expect(correction).toContain("'newIndex', v_index");
    expect(correction).toContain("'previousPlayingHandicap', v_previous_playing");
    expect(correction).toContain("'newPlayingHandicap', v_playing");
    expect(correction).toContain("'effectiveDate', p_effective");
    expect(correction).toContain("'roundStatus', v_status");
  });

  it("returns the summary the app reads", () => {
    expect(correction).toContain("'ok', true");
    expect(correction).toContain("'snapshotId', v_id");
    expect(correction).toContain("'playingHandicap', v_playing");
  });

  it("grants execute to authenticated only", () => {
    expect(code).toContain(
      "revoke all on function public.correct_handicap_snapshot(uuid, numeric, date, text) from public, anon;",
    );
    expect(code).toContain(
      "grant execute on function public.correct_handicap_snapshot(uuid, numeric, date, text) to authenticated;",
    );
    expect(code).not.toMatch(/grant execute [^;]*to anon/i);
    expect(code).not.toMatch(/grant execute [^;]*to public/i);
  });
});
