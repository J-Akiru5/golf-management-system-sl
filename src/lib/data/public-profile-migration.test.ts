import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase/migrations");
const read = (name: string) => readFileSync(join(dir, name), "utf8").replace(/\r\n/g, "\n");

function functionBlock(sql: string): string {
  const start = sql.indexOf("create or replace function public.public_player_scorecard(");
  const marker =
    "grant execute on function public.public_player_scorecard(uuid, uuid) to anon, authenticated;";
  return sql.slice(start, sql.indexOf(marker, start) + marker.length);
}

describe("migration 20261114000400: public profile playing handicap", () => {
  const before = functionBlock(read("20261110000100_public_release_enforcement.sql"));
  const after = functionBlock(read("20261114000400_public_profile_playing_handicap.sql"));

  it("is the existing function with exactly two lines added", () => {
    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    expect(afterLines.length).toBe(beforeLines.length + 2);
    expect(afterLines.filter((line) => !beforeLines.includes(line))).toEqual([
      "      r.playing_handicap,",
      "          'playingHandicap', playing_handicap,",
    ]);
  });

  it("keeps the release gate and the public grants exactly as they were", () => {
    expect(after).toContain("public.publish_allows(s.id, 'leaderboard')");
    expect(after).toContain("and s.published");
    expect(after).toContain(
      "revoke all on function public.public_player_scorecard(uuid, uuid) from public;",
    );
    expect(after).toContain("to anon, authenticated;");
  });

  it("changes no table, policy or other function", () => {
    const sql = read("20261114000400_public_profile_playing_handicap.sql");
    expect(sql).not.toMatch(/\b(create|alter|drop)\s+(table|policy|trigger|index)\b/i);
    expect(sql.match(/create or replace function/gi)).toHaveLength(1);
  });
});
