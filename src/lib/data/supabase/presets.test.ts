import { describe, expect, it } from "vitest";
import type { TournamentSettings } from "@/lib/data/presets";
import { parseApplyResult, parsePresetList, presetsUnavailable } from "@/lib/data/supabase/presets";

const settings: TournamentSettings = {
  tees: [{ name: "Blue", colour: "blue", gender: "M", rating: 69.6, slope: 130, par: 70 }],
  categories: [{ name: "Men", gender: "M", minAge: 0, maxAge: null, teeName: "Blue" }],
  flights: [{ name: "A", min: 0, max: 30 }],
  allowance: 1,
  maxIndex: 30,
  playingHandicapCap: 30,
  groupSize: 4,
  minGroupSize: 3,
  startFormat: "shotgun",
  firstTeeTime: "06:30",
  afternoonStart: "12:30",
  batchGapMinutes: 15,
  waveGapMinutes: 300,
  days: [{ dayNumber: 1, label: "Day 1", morning: "06:30", afternoon: "12:30" }],
};

describe("presetsUnavailable", () => {
  it("reads a missing table as the migration not being applied", () => {
    expect(
      presetsUnavailable({
        code: "42P01",
        message: 'relation "tournament_presets" does not exist',
      }),
    ).toBe(true);
    expect(
      presetsUnavailable({
        message: "Could not find the table 'public.tournament_presets' in the schema cache",
      }),
    ).toBe(true);
    expect(presetsUnavailable({ code: "PGRST202", message: "Could not find the function" })).toBe(
      true,
    );
  });

  it("leaves a real refusal alone", () => {
    expect(presetsUnavailable(null)).toBe(false);
    expect(presetsUnavailable({ message: 'A preset called "Bamboo" already exists.' })).toBe(false);
    expect(
      presetsUnavailable({
        code: "42501",
        message: "Only the owner or an organizer can save a preset",
      }),
    ).toBe(false);
  });
});

describe("parsePresetList", () => {
  it("reads rows and sorts them by name", () => {
    const list = parsePresetList([
      {
        id: "b",
        name: "Zulu standard",
        description: null,
        settings,
        created_at: "",
        updated_at: "",
      },
      {
        id: "a",
        name: "Alpha standard",
        description: "Two-tee",
        settings,
        created_at: "",
        updated_at: "",
      },
    ]);
    expect(list.unavailable).toBe(false);
    expect(list.presets.map((preset) => preset.name)).toEqual(["Alpha standard", "Zulu standard"]);
    expect(list.problems).toEqual([]);
  });

  it("keeps a broken preset in the problems list instead of dropping it", () => {
    const list = parsePresetList([
      { id: "a", name: "Broken", settings: { ...settings, allowance: 5 } },
      { id: "b", name: "Fine", settings },
    ]);
    expect(list.presets.map((preset) => preset.name)).toEqual(["Fine"]);
    expect(list.problems).toHaveLength(1);
    expect(list.problems[0]?.name).toBe("Broken");
    expect(list.problems[0]?.problems.join(" ")).toContain("10% to 100%");
  });

  it("reads a missing or unusable payload as an empty list", () => {
    expect(parsePresetList(null).presets).toEqual([]);
    expect(parsePresetList([null, 3, "x"]).problems).toHaveLength(3);
  });
});

describe("parseApplyResult", () => {
  it("reads the counts the database reported", () => {
    const result = parseApplyResult(
      {
        ok: true,
        revision: 12,
        applied: { tees: 3, categories: 4, flights: 4, days: 2 },
        ignoredDays: [3],
        notes: ["The preset caps the playing handicap at 24."],
      },
      7,
    );
    expect(result.revision).toBe(12);
    expect(result.applied).toEqual({ tees: 3, categories: 4, flights: 4, days: 2 });
    expect(result.ignoredDays).toEqual([3]);
    expect(result.notes).toHaveLength(1);
  });

  it("falls back to the revision on screen and zero counts", () => {
    const result = parseApplyResult({ ok: true }, 7);
    expect(result.revision).toBe(7);
    expect(result.applied).toEqual({ tees: 0, categories: 0, flights: 0, days: 0 });
    expect(result.ignoredDays).toEqual([]);
  });

  it("ignores values of the wrong type", () => {
    const result = parseApplyResult(
      { revision: "12", applied: { tees: "3" }, ignoredDays: ["3", 4], notes: [1, "a note"] },
      null,
    );
    expect(result.revision).toBeNull();
    expect(result.applied.tees).toBe(0);
    expect(result.ignoredDays).toEqual([4]);
    expect(result.notes).toEqual(["a note"]);
  });
});
