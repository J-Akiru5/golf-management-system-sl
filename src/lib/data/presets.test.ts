import { describe, expect, it } from "vitest";
import type { Tee } from "@/lib/routing";
import {
  ageBand,
  allowancePercent,
  PRESETS_UNAVAILABLE,
  presetProblemMessage,
  readPresetRow,
  readSettings,
  replacementLines,
  settingsFromTournament,
  settingsJson,
  settingsSummary,
  type TournamentSettings,
  teeColourOf,
} from "./presets";
import type { Tournament } from "./types";

/** The club's markers, as the live event carries them. The numbers are the spec's placeholders. */
const tees: Tee[] = [
  { id: "tee-blue", name: "Blue", courseRating: 69.6, slope: 130, par: 70 },
  { id: "tee-white", name: "White", courseRating: 67.9, slope: 127, par: 70 },
  { id: "tee-red", name: "Ladies Red", courseRating: 72.1, slope: 126, par: 70 },
];

const settings: TournamentSettings = {
  tees: [
    { name: "Blue", colour: "blue", gender: "M", rating: 69.6, slope: 130, par: 70 },
    { name: "White", colour: "white", gender: "any", rating: 67.9, slope: 127, par: 70 },
    { name: "Ladies Red", colour: "red", gender: "F", rating: 72.1, slope: 126, par: 70 },
  ],
  categories: [
    { name: "Regular", gender: "M", minAge: 0, maxAge: 59, teeName: "Blue" },
    { name: "Senior", gender: "M", minAge: 60, maxAge: null, teeName: "White" },
    { name: "Ladies", gender: "F", minAge: 0, maxAge: null, teeName: "Ladies Red" },
  ],
  flights: [
    { name: "Class A", min: 0, max: 12 },
    { name: "Class B", min: 12.1, max: 18 },
    { name: "Class C", min: 18.1, max: 23 },
    { name: "Class D", min: 23.1, max: 30 },
  ],
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
  days: [
    { dayNumber: 1, label: "Day 1", morning: "06:30", afternoon: "12:30" },
    { dayNumber: 2, label: "Day 2", morning: null, afternoon: null },
  ],
};

const tournament: Tournament = {
  id: "tournament",
  clubId: "club",
  name: "24th Bamboo Tee",
  nameNeedsConfirmation: false,
  courseId: "course",
  courseDataConfirmed: false,
  dates: ["2026-11-12", "2026-11-13"],
  cutOffDate: "2026-11-01",
  scheduleNeedsConfirmation: false,
  config: {
    date: "2026-11-12",
    maxIndex: 30,
    allowance: 1,
    flightBasis: "courseHandicap",
    startFormat: "shotgun",
    holes: 18,
    groupSize: 4,
    minGroupSize: 3,
    firstTeeTime: "06:30",
    pmFirstTeeTime: "12:30",
    intervalMinutes: 15,
    waveGapMinutes: 300,
  },
  categories: [
    { id: "cat-regular", name: "Regular", gender: "M", minAge: 0, maxAge: 59, teeId: "tee-blue" },
    { id: "cat-senior", name: "Senior", gender: "M", minAge: 60, maxAge: null, teeId: "tee-white" },
    { id: "cat-ladies", name: "Ladies", gender: "F", minAge: 0, maxAge: null, teeId: "tee-red" },
  ],
  flights: [
    { id: "flt-a", categoryId: "cat-regular", name: "Class A", min: 0, max: 12 },
    { id: "flt-b", categoryId: "cat-regular", name: "Class B", min: 12.1, max: 30 },
  ],
  days: [
    {
      id: "day-1",
      dayNumber: 1,
      playDate: "2026-11-12",
      label: "Day 1",
      startTime: "06:30",
      pmStartTime: "12:30",
      isPlayingDay: true,
    },
    {
      id: "day-2",
      dayNumber: 2,
      playDate: "2026-11-13",
      label: "Day 2",
      startTime: null,
      pmStartTime: null,
      isPlayingDay: true,
    },
  ],
  registration: {
    responseEmail: "",
    sponsorQuestion: "",
    payment: null,
    teeTimes: [],
    shirtSizes: [],
    fields: [],
    instructions: null,
  },
  staleIndexDays: 120,
  state: "open",
  createdAt: "2026-10-18T00:00:00.000Z",
};

describe("teeColourOf", () => {
  it("reads the colour out of the name the club uses", () => {
    expect(teeColourOf("Blue")).toBe("blue");
    expect(teeColourOf("Ladies Red")).toBe("red");
    expect(teeColourOf("white tee")).toBe("white");
    expect(teeColourOf("Silver")).toBe("silver");
  });

  it("returns null when the name does not say one of the four colours", () => {
    expect(teeColourOf("Senior")).toBeNull();
    expect(teeColourOf("")).toBeNull();
  });
});

describe("readSettings", () => {
  it("accepts the club's markers and rules", () => {
    const read = readSettings(settingsJson(settings));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.settings.tees).toHaveLength(3);
    expect(read.settings.categories[0]?.teeName).toBe("Blue");
    expect(read.settings.playingHandicapCap).toBe(30);
    expect(read.settings.days[1]?.morning).toBeNull();
  });

  it("accepts a preset with no classes, because a standard may have none", () => {
    const read = readSettings({ ...settingsJson(settings), flights: [] });
    expect(read.ok).toBe(true);
  });

  it("refuses a payload that is not an object", () => {
    expect(readSettings(null).ok).toBe(false);
    expect(readSettings([]).ok).toBe(false);
  });

  it("names a tee with no colour", () => {
    const read = readSettings({
      ...settingsJson(settings),
      tees: [{ ...settings.tees[0], colour: "green" }],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("Blue");
    expect(read.problems.join(" ")).toContain("Blue, Silver, White or Red");
  });

  it("names a tee name used twice", () => {
    const read = readSettings({
      ...settingsJson(settings),
      tees: [settings.tees[0], settings.tees[0]],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("used twice");
  });

  it("refuses two rows for one colour and gender", () => {
    const read = readSettings({
      ...settingsJson(settings),
      tees: [
        { ...settings.tees[0], name: "Blue championship" },
        { ...settings.tees[0], name: "Blue" },
      ],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("two tees in blue");
  });

  it("refuses a category pointing at a tee the preset does not hold", () => {
    const read = readSettings({
      ...settingsJson(settings),
      categories: [{ name: "Regular", gender: "M", minAge: 0, maxAge: null, teeName: "Gold" }],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain('names the tee "Gold"');
  });

  it("refuses categories that cover the same players", () => {
    const read = readSettings({
      ...settingsJson(settings),
      categories: [
        { name: "Regular", gender: "M", minAge: 0, maxAge: 59, teeName: "Blue" },
        { name: "Senior", gender: "M", minAge: 55, maxAge: null, teeName: "White" },
        { name: "Ladies", gender: "F", minAge: 0, maxAge: null, teeName: "Ladies Red" },
      ],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain('"Regular" and "Senior" cover the same players');
  });

  it("allows a men's and a women's band at the same ages", () => {
    const read = readSettings(settingsJson(settings));
    expect(read.ok).toBe(true);
  });

  it("refuses two categories with one name", () => {
    const read = readSettings({
      ...settingsJson(settings),
      categories: [
        { name: "Regular", gender: "M", minAge: 0, maxAge: 59, teeName: "Blue" },
        { name: "regular", gender: "F", minAge: 0, maxAge: null, teeName: "Ladies Red" },
      ],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain('The category name "regular" is used twice');
  });

  it("refuses two classes with one name", () => {
    const read = readSettings({
      ...settingsJson(settings),
      flights: [
        { name: "Class A", min: 0, max: 12 },
        { name: "Class A", min: 12.1, max: 30 },
      ],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain('The class name "Class A" is used twice');
  });

  it("refuses classes that overlap", () => {
    const read = readSettings({
      ...settingsJson(settings),
      flights: [
        { name: "Class A", min: 0, max: 15 },
        { name: "Class B", min: 15, max: 30 },
      ],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain('"Class A" and "Class B" overlap');
  });

  it("refuses a class that ends before it starts", () => {
    const read = readSettings({
      ...settingsJson(settings),
      flights: [{ name: "Class A", min: 20, max: 10 }],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("ends before it starts");
  });

  it("refuses an allowance outside 10% to 100%", () => {
    const read = readSettings({ ...settingsJson(settings), allowance: 0 });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("10% to 100%");
  });

  it("refuses a playing cap above the highest index allowed", () => {
    const read = readSettings({ ...settingsJson(settings), playingHandicapCap: 36 });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("cannot be above the highest index allowed");
  });

  it("refuses a smallest group larger than the group size", () => {
    const read = readSettings({ ...settingsJson(settings), groupSize: 2, minGroupSize: 3 });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("cannot be larger than the group size");
  });

  it("refuses an unknown start format", () => {
    const read = readSettings({ ...settingsJson(settings), startFormat: "rolling" });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("shotgun or two-tee");
  });

  it("refuses a time that is not a clock time", () => {
    const read = readSettings({ ...settingsJson(settings), firstTeeTime: "6.30" });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("06:30");
  });

  it("refuses a day listed twice", () => {
    const read = readSettings({
      ...settingsJson(settings),
      days: [
        { dayNumber: 1, label: "Day 1", morning: null, afternoon: null },
        { dayNumber: 1, label: "Day 1 again", morning: null, afternoon: null },
      ],
    });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems.join(" ")).toContain("Day 1 is listed twice");
  });

  it("needs at least one day and one category", () => {
    const read = readSettings({ ...settingsJson(settings), days: [], categories: [] });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problems).toContain("A preset needs at least one playing day.");
    expect(read.problems).toContain("A preset needs at least one category.");
  });
});

describe("settingsFromTournament", () => {
  it("builds the settings the event runs on", () => {
    const built = settingsFromTournament(tournament, tees);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const builtSettings = built.settings;
    expect(builtSettings.tees.map((tee) => [tee.name, tee.colour, tee.gender])).toEqual([
      ["Blue", "blue", "M"],
      // White is played by the men's Senior category only, so the preset records it as a men's tee.
      ["White", "white", "M"],
      ["Ladies Red", "red", "F"],
    ]);
    expect(builtSettings.categories.map((category) => category.teeName)).toEqual([
      "Blue",
      "White",
      "Ladies Red",
    ]);
    expect(builtSettings.flights).toHaveLength(2);
    expect(builtSettings.allowance).toBe(1);
    expect(builtSettings.maxIndex).toBe(30);
    // The draw caps at the highest index allowed, so that is what the event runs on today.
    expect(builtSettings.playingHandicapCap).toBe(30);
    expect(builtSettings.batchGapMinutes).toBe(15);
    expect(builtSettings.afternoonStart).toBe("12:30");
    expect(builtSettings.days).toEqual([
      { dayNumber: 1, label: "Day 1", morning: "06:30", afternoon: "12:30" },
      { dayNumber: 2, label: "Day 2", morning: null, afternoon: null },
    ]);
  });

  it("reads the day list from the dates when the event has no stored days", () => {
    const built = settingsFromTournament({ ...tournament, days: undefined }, tees);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.settings.days).toHaveLength(2);
    expect(built.settings.days[0]?.morning).toBe("06:30");
    expect(built.settings.days[1]?.morning).toBeNull();
  });

  it("stops with a message naming a tee whose name has no colour", () => {
    const named = [
      ...tees,
      { id: "tee-gold", name: "Championship", courseRating: 71, slope: 125, par: 70 },
    ];
    const built = settingsFromTournament(
      {
        ...tournament,
        categories: [
          ...tournament.categories,
          {
            id: "cat-champ",
            name: "Championship",
            gender: "M" as const,
            minAge: 0,
            maxAge: null,
            teeId: "tee-gold",
          },
        ],
      },
      named,
    );
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problems.join(" ")).toContain(
      'Tee "Championship" does not name one of the four colours',
    );
  });

  it("would rather stop than store a category with no tee", () => {
    const built = settingsFromTournament(
      {
        ...tournament,
        categories: [
          { id: "cat-x", name: "Orphan", gender: "M", minAge: 0, maxAge: null, teeId: "" },
        ],
        flights: [],
      },
      tees,
    );
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problems.join(" ")).toContain('Category "Orphan" has no tee');
  });
});

describe("summary and replacement lines", () => {
  it("groups the tees by who plays them", () => {
    const teesLine = settingsSummary(settings).find((line) => line.label === "Tees");
    expect(teesLine?.detail).toContain("Men: Blue 69.6/130/par 70");
    expect(teesLine?.detail).toContain("Women: Ladies Red 72.1/126/par 70");
    expect(teesLine?.detail).toContain("Everyone: White 67.9/127/par 70");
  });

  it("writes the handicap and start rules in plain words", () => {
    const lines = settingsSummary(settings);
    expect(lines.find((line) => line.label === "Handicap")?.detail).toBe(
      "100% allowance, index limit 30, playing handicap capped at 30",
    );
    expect(lines.find((line) => line.label === "Start")?.detail).toContain(
      "Shotgun start from 06:30, afternoon from 12:30",
    );
  });

  it("says a standard has no classes when it has none", () => {
    const lines = settingsSummary({ ...settings, flights: [] });
    expect(lines.find((line) => line.label === "Classes")?.detail).toContain("No classes");
  });

  it("does not list a filed entry: a preset is applied before entries exist", () => {
    // The refusal lives in the database and in the card's note; the confirm lists the rules only.
    expect(replacementLines(settings, settings).join(" ")).not.toContain("already filed");
  });

  it("names what each rule becomes", () => {
    const next: TournamentSettings = {
      ...settings,
      allowance: 0.85,
      maxIndex: 24,
      playingHandicapCap: 24,
      groupSize: 3,
      firstTeeTime: "07:00",
    };
    const lines = replacementLines(settings, next);
    expect(lines.join(" ")).toContain("100% / 30 becomes 85% / 24");
    expect(lines.join(" ")).toContain("up to 4 becomes up to 3");
    expect(lines.join(" ")).toContain("from 06:30 becomes shotgun from 07:00");
  });

  it("formats an age band and an allowance", () => {
    expect(ageBand({ minAge: 0, maxAge: 59 })).toBe("0 to 59");
    expect(ageBand({ minAge: 70, maxAge: null })).toBe("70 and over");
    expect(allowancePercent(0.85)).toBe("85%");
  });
});

describe("readPresetRow", () => {
  it("reads a stored row", () => {
    const row = readPresetRow({
      id: "preset-1",
      name: "Bamboo Tee standard",
      description: "Four days, two-tee start",
      settings: settingsJson(settings),
      created_at: "2026-11-21T00:00:00.000Z",
      updated_at: "2026-11-21T00:00:00.000Z",
    });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.preset.name).toBe("Bamboo Tee standard");
    expect(row.preset.description).toBe("Four days, two-tee start");
    expect(row.preset.settings.maxIndex).toBe(30);
  });

  it("reports a row whose settings no longer pass, instead of dropping it", () => {
    const row = readPresetRow({
      id: "preset-1",
      name: "Old preset",
      settings: { ...settingsJson(settings), allowance: 2 },
    });
    expect(row.ok).toBe(false);
    if (row.ok) return;
    expect(row.problems.join(" ")).toContain("10% to 100%");
  });

  it("reports a row with no id or name", () => {
    expect(readPresetRow({ settings: settingsJson(settings) }).ok).toBe(false);
    expect(readPresetRow("not a row").ok).toBe(false);
  });
});

describe("presetProblemMessage", () => {
  it("turns a missing table into the one message the card shows", () => {
    expect(presetProblemMessage('relation "public.tournament_presets" does not exist')).toBe(
      PRESETS_UNAVAILABLE,
    );
    expect(presetProblemMessage("Could not find the table 'public.tournament_presets'")).toBe(
      PRESETS_UNAVAILABLE,
    );
  });

  it("leaves any other refusal as the database wrote it", () => {
    const message = "A preset with this name already exists.";
    expect(presetProblemMessage(message)).toBe(message);
  });
});
