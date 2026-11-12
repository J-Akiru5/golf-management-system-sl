import { describe, expect, it } from "vitest";
import {
  buildResultsSheet,
  type ResultsPlayerInput,
  resultHoles,
  resultPosition,
  resultScore,
} from "./results-sheet";

function player(
  name: string,
  points: number | null,
  overrides: Partial<ResultsPlayerInput> = {},
): ResultsPlayerInput {
  return {
    playerId: name.toLowerCase().replace(/\s+/g, "-"),
    playerName: name,
    playingHandicap: 10,
    grossStrokes: points === null ? null : 82,
    netStrokes: points === null ? null : 72,
    points,
    holesPlayed: points === null ? 0 : 18,
    holesTotal: 18,
    session: "AM",
    ...overrides,
  };
}

const base = {
  eventName: "24th Bamboo Tee",
  dayNumber: 1,
  dayLabel: "Day 1",
  playDate: "2026-11-14",
  dateLabel: "Sat, 14 Nov 2026",
};

describe("results sheet ordering", () => {
  it("puts the highest net Stableford points first", () => {
    const sheet = buildResultsSheet({
      ...base,
      players: [player("Low", 30), player("High", 38), player("Middle", 34)],
      splitBySession: false,
    });

    expect(sheet.tables).toHaveLength(1);
    const rows = sheet.tables[0]?.rows ?? [];
    expect(rows.map((row) => row.playerName)).toEqual(["High", "Middle", "Low"]);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3]);
    expect(rows.map(resultPosition)).toEqual(["1", "2", "3"]);
  });
});

describe("results sheet ties", () => {
  it("shares a position, marks both rows, and moves the next player past the tie", () => {
    const sheet = buildResultsSheet({
      ...base,
      players: [
        player("First", 38),
        player("Second", 34),
        player("Third", 34),
        player("Fourth", 30),
      ],
      splitBySession: false,
    });

    expect(sheet.tables[0]?.rows.map((row) => row.position)).toEqual([1, 2, 2, 4]);
    expect(sheet.tables[0]?.rows.map((row) => row.tied)).toEqual([false, true, true, false]);
    expect(sheet.tables[0]?.rows.map(resultPosition)).toEqual(["1", "2T", "2T", "4"]);
  });
});

describe("results sheet cards", () => {
  it("shows a dash, not a zero, for a player with no card", () => {
    const sheet = buildResultsSheet({
      ...base,
      players: [player("Carded", 32), player("No card", null)],
      splitBySession: false,
    });

    const row = sheet.tables[0]?.rows[1];
    expect(row?.noCard).toBe(true);
    expect(row?.position).toBeNull();
    expect(resultPosition(row!)).toBe("—");
    expect(resultScore(row?.grossStrokes ?? null)).toBe("—");
    expect(resultScore(row?.netStrokes ?? null)).toBe("—");
    expect(resultScore(row?.points ?? null)).toBe("—");
    expect(resultHoles(row!)).toBe("—");
  });

  it("shows the holes played for an incomplete card and still ranks it", () => {
    const sheet = buildResultsSheet({
      ...base,
      players: [
        player("Incomplete", 21, {
          grossStrokes: 40,
          netStrokes: 36,
          holesPlayed: 9,
          holesTotal: 18,
        }),
      ],
      splitBySession: false,
    });

    const row = sheet.tables[0]?.rows[0];
    expect(row?.position).toBe(1);
    expect(resultHoles(row!)).toBe("9/18");
    expect(resultScore(row?.grossStrokes ?? null)).toBe(40);
  });
});

describe("results sheet sessions", () => {
  it("splits Day 1 into separate AM and PM tables", () => {
    const sheet = buildResultsSheet({
      ...base,
      players: [
        player("Morning One", 30, { session: "AM" }),
        player("Afternoon One", 34, { session: "PM" }),
        player("Morning Two", 36, { session: "AM" }),
      ],
      splitBySession: true,
    });

    expect(sheet.tables.map((table) => table.title)).toEqual(["Day 1 · AM", "Day 1 · PM"]);
    expect(sheet.tables[0]?.rows.map((row) => row.playerName)).toEqual([
      "Morning Two",
      "Morning One",
    ]);
    expect(sheet.tables[1]?.rows.map((row) => row.playerName)).toEqual(["Afternoon One"]);
  });

  it("prints one table when only one session is asked for", () => {
    const sheet = buildResultsSheet({
      ...base,
      players: [
        player("Morning", 30, { session: "AM" }),
        player("Afternoon", 34, { session: "PM" }),
      ],
      splitBySession: true,
      session: "PM",
    });

    expect(sheet.tables).toHaveLength(1);
    expect(sheet.tables[0]?.title).toBe("Day 1 · PM");
    expect(sheet.tables[0]?.rows.map((row) => row.playerName)).toEqual(["Afternoon"]);
  });

  it("keeps another day as one table even when its players have sessions", () => {
    const sheet = buildResultsSheet({
      ...base,
      dayNumber: 2,
      dayLabel: "Day 2",
      players: [
        player("Morning", 30, { session: "AM" }),
        player("Afternoon", 34, { session: "PM" }),
      ],
      splitBySession: false,
    });

    expect(sheet.tables).toHaveLength(1);
    expect(sheet.tables[0]?.title).toBe("Day 2");
    expect(sheet.tables[0]?.rows.map((row) => row.playerName)).toEqual(["Afternoon", "Morning"]);
  });

  it("shows an unrecorded session apart instead of guessing it into AM or PM", () => {
    const sheet = buildResultsSheet({
      ...base,
      players: [player("Morning", 30, { session: "AM" }), player("Not set", 34, { session: null })],
      splitBySession: true,
    });

    expect(sheet.tables.map((table) => table.title)).toEqual([
      "Day 1 · AM",
      "Day 1 · PM",
      "Day 1 · session not set",
    ]);
    expect(sheet.tables[2]?.rows.map((row) => row.playerName)).toEqual(["Not set"]);
  });

  it("prints one honest table when no player has a recorded session", () => {
    const sheet = buildResultsSheet({
      ...base,
      players: [player("One", 30, { session: null }), player("Two", 34, { session: null })],
      splitBySession: true,
    });

    expect(sheet.tables).toHaveLength(1);
    expect(sheet.tables[0]?.title).toBe("Day 1 · session not set");
    expect(sheet.tables[0]?.rows.map((row) => row.playerName)).toEqual(["Two", "One"]);
  });
});
