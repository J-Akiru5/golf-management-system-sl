import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * There is no database in this repository, so the pick-up migration is guarded as text. These tests
 * do not run SQL. They check that the file changes only what the brief allows, keeps every replaced
 * function's signature and role check, and documents that it has not been applied.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const PICKUP_FILE = "20261113000200_pickup_scores.sql";

const read = (file: string) => readFileSync(join(MIGRATIONS, file), "utf8");
const pickup = read(PICKUP_FILE);

/** Every function this file replaces, and the migration its newest definition came from. */
const REPLACED = [
  { name: "check_scorecard_entry", from: "20261035000000_scoring_schema.sql" },
  { name: "submit_scorecard", from: "20261036000000_scoring_workflow.sql" },
  { name: "recalculate_player_results", from: "20261036000000_scoring_workflow.sql" },
  { name: "apply_canonical", from: "20261036000000_scoring_workflow.sql" },
  { name: "approve_scorecard", from: "20261036000000_scoring_workflow.sql" },
  { name: "resolve_hole", from: "20261036000000_scoring_workflow.sql" },
  { name: "build_round_scorecards", from: "20261042000000_player_scorecard_snapshot.sql" },
];

function functionBlock(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start === -1) throw new Error(`public.${name} was not found`);
  const end = sql.indexOf("$$;", start);
  if (end === -1) throw new Error(`The body of public.${name} was not closed`);
  return sql.slice(start, end + 3);
}

/** The first occurrence of a function is its definition in each of these files. */
function parameterTypes(block: string): string[] {
  const open = block.indexOf("(");
  const close = block.indexOf(")", open);
  const list = block.slice(open + 1, close).trim();
  if (list === "") return [];
  return list.split(",").map((parameter) => {
    const withoutDefault = parameter.split(/\bdefault\b/)[0]?.trim() ?? "";
    const match = /^\w+\s+(.+)$/.exec(withoutDefault);
    if (!match?.[1]) throw new Error(`Cannot read the parameter "${parameter}"`);
    return match[1].replace(/\s+/g, " ").trim();
  });
}

function replacedFunctionNames(sql: string): string[] {
  return [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("the pick-up migration header", () => {
  it("says it has not been applied and names owner approval", () => {
    const header = pickup.slice(0, 900);
    expect(header).toContain("NOT APPLIED");
    expect(header).toMatch(/owner must approve/i);
  });
});

describe("the pick-up tables", () => {
  it("adds picked_up with default false to the three tables", () => {
    for (const table of ["scorecard_entries", "hole_resolutions", "approved_hole_scores"]) {
      expect(pickup).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+add column picked_up boolean not null default false;`,
        ),
      );
    }
  });

  it("names the three checks that a pick-up needs", () => {
    expect(pickup).toContain("constraint scorecard_entries_pickup_check");
    expect(pickup).toContain("check (not picked_up or strokes is null);");

    expect(pickup).toContain("constraint hole_resolutions_pickup_score_check");
    expect(pickup).toContain("constraint approved_hole_scores_pickup_score_check");
    expect(
      pickup.match(/check \(\(picked_up and strokes = 0\) or \(not picked_up and strokes > 0\)\)/g),
    ).toHaveLength(2);
  });

  it("drops only the two auto-named stroke checks it replaces", () => {
    const dropped = [...pickup.matchAll(/drop constraint ([a-z_]+)/g)].map((match) => match[1]);
    expect(dropped).toEqual([
      "hole_resolutions_strokes_check",
      "approved_hole_scores_strokes_check",
    ]);
  });
});

describe("the replaced functions", () => {
  it("replaces exactly the seven functions the brief names", () => {
    expect(replacedFunctionNames(pickup)).toEqual(REPLACED.map((entry) => entry.name));
  });

  it("keeps security definer, the search path and the role check", () => {
    for (const { name, from } of REPLACED) {
      const original = functionBlock(read(from), name);
      const replacement = functionBlock(pickup, name);

      expect(replacement, name).toContain("security definer");
      expect(replacement, name).toContain("set search_path = ''");
      expect(replacement, name).toContain("picked_up");
      if (original.includes("has_club_role")) {
        expect(replacement, name).toContain("has_club_role");
      }
    }
  });

  it("does not change a single parameter list", () => {
    for (const { name, from } of REPLACED) {
      expect(parameterTypes(functionBlock(pickup, name)), name).toEqual(
        parameterTypes(functionBlock(read(from), name)),
      );
    }
  });
});

describe("the migration's effects", () => {
  it("does not remove or rewrite data, functions, policies or storage", () => {
    expect(pickup).not.toMatch(/drop table/i);
    expect(pickup).not.toMatch(/drop function/i);
    expect(pickup).not.toMatch(/delete from/i);
    expect(pickup).not.toMatch(/truncate/i);
    expect(pickup).not.toMatch(/create policy|drop policy|alter policy/i);
    expect(pickup).not.toMatch(/enable row level security|disable row level security/i);
    expect(pickup).not.toMatch(/storage\.buckets/i);
  });

  it("ends with the checks to run on a disposable project", () => {
    const checks = pickup.slice(pickup.indexOf("-- Checks to run once applied"));
    expect(checks).toContain("Checks to run once applied to a disposable project");
    for (const number of [1, 2, 3, 4, 5, 6]) {
      expect(checks).toContain(`\n-- ${number}.`);
    }
  });
});
