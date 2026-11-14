import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REVEAL_LANES } from "./results-reveal";

/**
 * The awarding migration is written for the owner to apply and is not applied anywhere, so there is
 * no database to test against. These checks read the SQL as text and guard the parts that are easy to
 * break by editing: that it stays marked not applied and additive, that the lane list matches the
 * application, and that a held lane's board cannot come back through the public read.
 */

const FILE = "20261115000200_results_reveal.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", FILE), "utf8");

describe("the awarding migration", () => {
  it("keeps the agreed number and says it is not applied", () => {
    expect(FILE).toBe("20261115000200_results_reveal.sql");
    expect(sql.slice(0, 400)).toContain("NOT APPLIED");
    // Two branches shipped one number on the same day; the file says which one it follows.
    expect(sql.slice(0, 600)).toContain("20261115000100_card_handicap_signed_handicap.sql");
    expect(sql).toContain("20261110000100_public_release_enforcement.sql");
  });

  it("creates one read and no table, column, policy or trigger", () => {
    expect(sql).toContain("create or replace function public.public_reveal_state(");
    expect(sql).not.toMatch(/\bcreate table\b/i);
    expect(sql).not.toMatch(/\balter table\b/i);
    expect(sql).not.toMatch(/\bcreate policy\b/i);
    expect(sql).not.toMatch(/\bcreate (or replace )?(trigger|index|type|schema)\b/i);
    // Additive only: the owner applies it, and a mistake here is not reversible on a live event.
    expect(sql).not.toMatch(/\bdrop (table|column|policy|function|index|trigger|type|schema)\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\binsert into\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
  });

  it("is a security definer read anon may execute", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke all on function public.public_reveal_state(uuid) from public;");
    expect(sql).toContain(
      "grant execute on function public.public_reveal_state(uuid) to anon, authenticated;",
    );
  });

  it("answers every lane the application sends", () => {
    for (const lane of REVEAL_LANES) {
      expect(sql).toContain(`('${lane.id}')`);
    }
  });

  it("returns a lane's board only while the lane is released", () => {
    // The gate: held means an empty array, and the array is only read for a released lane.
    expect(sql).toMatch(/'board', case[\s\S]*?<> 'released' then '\[\]'::jsonb/);
    expect(sql).toMatch(/jsonb_typeof\([\s\S]*?-> 'board'\) = 'array'/);
    // And the guard in the catalog check refuses a body that lost that gate.
    expect(sql).toContain("does not hold the board of a held lane");
  });

  it("never reads a player or a score", () => {
    // Only the function body, not the guard below it that names the tables it must not touch.
    const start = sql.indexOf("as $$");
    const body = sql.slice(start, sql.indexOf("$$;", start));
    for (const table of [
      "public.registrations",
      "public.players",
      "public.round_publications",
      "public.competition_rounds",
      "public.scorecards",
    ]) {
      expect(body).not.toContain(table);
    }
    // It reads the event row only.
    expect(body).toContain("from public.tournaments t");
  });

  it("treats an unusable stored time as no countdown, never as a cast error", () => {
    expect(sql).toMatch(/~\s*'\^\[0-9\]\{4\}/);
    expect(sql).toContain("::timestamptz");
  });
});
