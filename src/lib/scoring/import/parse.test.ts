import { describe, expect, it } from "vitest";
import { parseScorecardImport } from "./parse";
import { SCORECARD_IMPORT_FORMAT, SCORECARD_IMPORT_VERSION } from "./types";

function holes(): Record<string, number> {
  return {
    "1": 6,
    "2": 5,
    "3": 4,
    "4": 4,
    "5": 6,
    "6": 5,
    "7": 3,
    "8": 5,
    "9": 5,
    "10": 5,
    "11": 4,
    "12": 4,
    "13": 6,
    "14": 5,
    "15": 6,
    "16": 4,
    "17": 5,
    "18": 6,
  };
}

function validFile(): Record<string, unknown> {
  return {
    format: SCORECARD_IMPORT_FORMAT,
    version: SCORECARD_IMPORT_VERSION,
    roundId: "8f14e45f-ea4b-4c3a-9f0e-2b6d1c7a5e10",
    tournamentId: "2c9a7b60-3f4d-4e8a-9b1c-6d5e4f3a2b10",
    dayNumber: 1,
    extractedBy: "Karl",
    extractedAt: "2026-11-12T18:40:00+08:00",
    cards: [
      {
        cardKey: "d1-g1-adorio-sulpico",
        groupNumber: 1,
        playerId: "0b7f6e5d-4c3b-4a29-8176-5f4e3d2c1b0a",
        playerName: "ADORIO, RONNEL",
        markerPlayerId: "1c8e7f6a-5b4d-4c3e-9f2a-6b7c8d9e0f1a",
        markerName: "SULPICO, RANDY",
        writtenTotal: 88,
        holes: holes(),
        notes: null,
      },
    ],
    skipped: [],
  };
}

describe("parseScorecardImport", () => {
  it("accepts the documented example", () => {
    const result = parseScorecardImport(validFile());
    expect(result.problems).toEqual([]);
    expect(result.file?.cards).toHaveLength(1);
    expect(result.file?.cards[0]?.holes["18"]).toBe(6);
    expect(result.file?.format).toBe(SCORECARD_IMPORT_FORMAT);
    expect(result.file?.version).toBe(SCORECARD_IMPORT_VERSION);
  });

  it("accepts the demo's non-UUID ids", () => {
    const input = validFile();
    input.roundId = "demo-round-1";
    input.tournamentId = "bamboo-tee-2026";
    const card = (input.cards as Record<string, unknown>[])[0];
    if (!card) throw new Error("fixture");
    card.playerId = "demo-p1";
    card.markerPlayerId = "demo-p2";
    const result = parseScorecardImport(input);
    expect(result.problems).toEqual([]);
    expect(result.file?.roundId).toBe("demo-round-1");
  });

  it("accepts numeric strings for scores, group and total", () => {
    const input = validFile();
    const card = (input.cards as Record<string, unknown>[])[0];
    if (!card) throw new Error("fixture");
    card.holes = Object.fromEntries(
      Object.entries(holes()).map(([hole, strokes]) => [hole, String(strokes)]),
    );
    card.writtenTotal = "88";
    card.groupNumber = "1";
    const result = parseScorecardImport(input);
    expect(result.problems).toEqual([]);
    expect(result.file?.cards[0]?.writtenTotal).toBe(88);
    expect(result.file?.cards[0]?.groupNumber).toBe(1);
  });

  it("leaves out a card with a missing hole and names it", () => {
    const input = validFile();
    const card = (input.cards as Record<string, unknown>[])[0];
    if (!card) throw new Error("fixture");
    const nextHoles = holes();
    delete nextHoles["7"];
    card.holes = nextHoles;
    const result = parseScorecardImport(input);
    expect(result.file?.cards).toEqual([]);
    expect(result.problems.some((problem) => problem.message.includes("Hole 7 is missing"))).toBe(
      true,
    );
  });

  it("refuses a null hole instead of guessing it", () => {
    const input = validFile();
    const card = (input.cards as Record<string, unknown>[])[0];
    if (!card) throw new Error("fixture");
    card.holes = { ...holes(), "7": null };
    const result = parseScorecardImport(input);
    expect(result.file?.cards).toEqual([]);
    expect(result.problems.some((problem) => problem.message.includes("Hole 7 is empty"))).toBe(
      true,
    );
  });

  it("refuses a score above the limit", () => {
    const input = validFile();
    const card = (input.cards as Record<string, unknown>[])[0];
    if (!card) throw new Error("fixture");
    card.holes = { ...holes(), "7": 21 };
    const result = parseScorecardImport(input);
    expect(result.file?.cards).toEqual([]);
    expect(result.problems.some((problem) => problem.path === "cards[0].holes.7")).toBe(true);
  });

  it("refuses a written total that does not add up", () => {
    const input = validFile();
    const card = (input.cards as Record<string, unknown>[])[0];
    if (!card) throw new Error("fixture");
    card.writtenTotal = 87;
    const result = parseScorecardImport(input);
    expect(result.file?.cards).toEqual([]);
    expect(result.problems.some((problem) => problem.message.includes("holes add up to 88"))).toBe(
      true,
    );
  });

  it("accepts a null written total", () => {
    const input = validFile();
    const card = (input.cards as Record<string, unknown>[])[0];
    if (!card) throw new Error("fixture");
    card.writtenTotal = null;
    const result = parseScorecardImport(input);
    expect(result.problems).toEqual([]);
    expect(result.file?.cards[0]?.writtenTotal).toBeNull();
  });

  it("refuses a duplicate card key", () => {
    const input = validFile();
    const first = (input.cards as Record<string, unknown>[])[0];
    if (!first) throw new Error("fixture");
    input.cards = [first, { ...first }];
    const result = parseScorecardImport(input);
    expect(result.file?.cards).toHaveLength(1);
    expect(result.problems.some((problem) => problem.message.includes("used more than once"))).toBe(
      true,
    );
  });

  it("refuses a card with neither a player id nor a name", () => {
    const input = validFile();
    const card = (input.cards as Record<string, unknown>[])[0];
    if (!card) throw new Error("fixture");
    card.playerId = null;
    card.playerName = null;
    const result = parseScorecardImport(input);
    expect(result.file?.cards).toEqual([]);
    expect(result.problems.some((problem) => problem.message.includes("needs a player"))).toBe(
      true,
    );
  });

  it("refuses an extra hole key", () => {
    const input = validFile();
    const card = (input.cards as Record<string, unknown>[])[0];
    if (!card) throw new Error("fixture");
    card.holes = { ...holes(), "19": 4 };
    const result = parseScorecardImport(input);
    expect(result.file?.cards).toEqual([]);
    expect(result.problems.some((problem) => problem.path === "cards[0].holes.19")).toBe(true);
  });

  it("refuses a wrong format", () => {
    const input = validFile();
    input.format = "something-else";
    const result = parseScorecardImport(input);
    expect(result.file).toBeNull();
    expect(result.problems[0]?.path).toBe("format");
  });

  it("refuses a timestamp without a time zone", () => {
    const input = validFile();
    input.extractedAt = "2026-11-12T18:40:00";
    const result = parseScorecardImport(input);
    expect(result.file).toBeNull();
    expect(result.problems.some((problem) => problem.path === "extractedAt")).toBe(true);
  });

  it("reads the skipped list", () => {
    const input = validFile();
    input.skipped = [
      {
        groupNumber: 7,
        playerName: "TAN, JUAN RICARDO",
        reason: "Hole 14 is illegible.",
      },
    ];
    const result = parseScorecardImport(input);
    expect(result.problems).toEqual([]);
    expect(result.file?.skipped[0]?.reason).toBe("Hole 14 is illegible.");
  });
});
