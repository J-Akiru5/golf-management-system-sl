import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The scan inbox migration is written for review and is not applied, so there is no database to
 * test against. These checks read the SQL as text and guard the parts that are easy to break by
 * editing: the header, the RLS posture, the function guards, the state transitions and that the
 * file stays additive.
 */

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261113000100_scorecard_scans.sql"),
  "utf8",
);

const FUNCTIONS = [
  "create_scorecard_scan",
  "record_scan_reading",
  "match_scorecard_scan",
  "confirm_scorecard_scan",
  "set_aside_scorecard_scan",
  "restore_scorecard_scan",
  "attach_scan_card",
] as const;

function functionMarker(name: string): string {
  return `create or replace function public.${name}(`;
}

/** One function, from its `create` line to the line before the next function, grants included. */
function section(name: string): string {
  const start = sql.indexOf(functionMarker(name));
  expect(start, `${name} is missing from the migration`).toBeGreaterThan(-1);

  const later = FUNCTIONS.map((other) => sql.indexOf(functionMarker(other))).filter(
    (index) => index > start,
  );
  const end = later.length > 0 ? Math.min(...later) : sql.length;
  return sql.slice(start, end);
}

describe("scorecard scans migration", () => {
  it("is marked not applied and names the migrations it depends on", () => {
    const header = sql.slice(0, sql.indexOf("-- The inbox"));

    expect(header).toContain("NOT APPLIED");
    expect(header).toContain("20261035000000_scoring_schema.sql");
    expect(header).toContain("20261036000000_scoring_workflow.sql");
    expect(sql).toContain("Checks to run once applied to a disposable project");
  });

  it("creates only the new table", () => {
    const tables = sql.match(/create table\s+[a-z_.]+/gi) ?? [];
    expect(tables).toEqual(["create table public.scorecard_scans"]);
  });

  it("enables row level security with a member read policy and no write policy", () => {
    expect(sql).toContain("alter table public.scorecard_scans enable row level security;");

    const policies = sql.match(/create policy [\s\S]*?on public\.scorecard_scans[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(1);

    for (const policy of policies) {
      expect(policy).toContain("for select to authenticated");
      expect(policy).toContain("public.is_club_member(club_id)");
      expect(policy).not.toMatch(/for (insert|update|delete|all)/);
    }
  });

  it("allows exactly the six states", () => {
    const list = sql.match(/constraint scorecard_scans_state check \(\s*state in \(([^)]*)\)/)?.[1];

    const states = [...(list ?? "").matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(states).toEqual([
      "uploaded",
      "read",
      "matched",
      "confirmed",
      "card_created",
      "set_aside",
    ]);
    expect(sql).toContain("state text not null default 'uploaded'");
  });

  it("records each legal state change and no other", () => {
    // The guards that decide which change is allowed, per function.
    expect(section("record_scan_reading")).toContain("v_state not in ('uploaded', 'read')");
    expect(section("match_scorecard_scan")).toContain(
      "v_state not in ('read', 'matched', 'confirmed')",
    );
    expect(section("confirm_scorecard_scan")).toContain("v_state <> 'matched'");
    expect(section("set_aside_scorecard_scan")).toContain(
      "v_state not in ('uploaded', 'read', 'matched', 'confirmed')",
    );
    expect(section("restore_scorecard_scan")).toContain("v_state <> 'set_aside'");
    expect(section("attach_scan_card")).toContain("v_state <> 'confirmed'");

    // The state each function writes.
    expect(section("record_scan_reading")).toContain("state = 'read'");
    expect(section("match_scorecard_scan")).toContain("state = 'matched'");
    expect(section("match_scorecard_scan")).toContain("state = 'read'");
    expect(section("confirm_scorecard_scan")).toContain("state = 'confirmed'");
    expect(section("set_aside_scorecard_scan")).toContain("state = 'set_aside'");
    expect(section("attach_scan_card")).toContain("state = 'card_created'");

    // Restore goes back to read when a reading exists, otherwise to uploaded.
    expect(section("restore_scorecard_scan")).toContain("then 'read'");
    expect(section("restore_scorecard_scan")).toContain("else 'uploaded'");

    // card_created is final: no guard may accept it as a starting state.
    const guards = sql.match(/v_state not in \([^)]*\)|v_state <> '[a-z_]+'/g) ?? [];
    expect(guards).toHaveLength(6);
    for (const guard of guards) expect(guard).not.toContain("card_created");
  });

  it.each(FUNCTIONS)("%s is guarded, audited and executable only by a signed-in member", (name) => {
    const body = section(name);

    expect(body).toContain("language plpgsql");
    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
    expect(body).toMatch(/public\.has_club_role\(v_club, array\['owner', 'organizer', 'desk'\]\)/);
    expect(body).toContain("'owner'");
    expect(body).toContain("'organizer'");
    expect(body).toContain("'desk'");
    expect(body).toContain("using errcode = '42501'");

    expect(body).toMatch(/revoke all on function public\.\w+\([\s\S]*?from public, anon;/);
    expect(body).toMatch(/grant execute on function public\.\w+\([\s\S]*?to authenticated;/);

    expect(body).toContain("insert into public.scoring_audit");
    expect(body).toContain("'scorecard_scan'");
  });

  it("indexes the inbox by round and state and by club and arrival", () => {
    expect(sql).toContain(
      "create index scorecard_scans_round_state on public.scorecard_scans (round_id, state)",
    );
    expect(sql).toContain(
      "create index scorecard_scans_club_created on public.scorecard_scans (club_id, created_at)",
    );
  });

  it("is additive and never reaches into storage", () => {
    expect(sql).not.toMatch(/\bdrop (table|column|policy|function|index|trigger|type|schema)\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/storage\.(buckets|objects)/i);

    const altered = sql.match(/alter table\s+[a-z_.]+/gi) ?? [];
    expect(altered).toEqual(["alter table public.scorecard_scans"]);
  });
});
