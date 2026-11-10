import { describe, expect, it } from "vitest";
import type { PublicPairings } from "@/lib/data/types";
import { type BoardScope, buildPrintBook, type PrintBookInput, printFileName } from "./export-book";
import type { ExportGroup } from "./export-model";

const player = (name: string) => ({
  name,
  teeName: "White",
  handicapIndex: 10,
  playingHandicap: 11,
});
const group = (number: number, time: string, names: string[]): ExportGroup => ({
  number,
  startHole: number,
  time,
  flight: "Class A",
  players: names.map(player),
});
const board = (n: number, groups: ExportGroup[]): BoardScope => ({
  dayNumber: n,
  dayLabel: `Day ${n}`,
  playDate: `2026-11-1${1 + n}`,
  dateLabel: `Day ${n} date`,
  groups,
});
const pairings: PublicPairings = {
  tournamentName: "24th Bamboo Tee",
  dateLabel: "Nov 2026",
  startFormat: "shotgun",
  groups: [
    {
      number: 1,
      startHole: 1,
      time: "06:30",
      flight: "A",
      players: [{ name: "Ana" }, { name: "Bo" }],
    },
  ],
} as unknown as PublicPairings;

const base: PrintBookInput = {
  kind: "start",
  eventName: "24th Bamboo Tee",
  status: "Draft · not published",
  startFormat: "shotgun",
  course: "official",
  boards: [board(3, [group(1, "06:30", ["Ana", "Bo"])])],
  pairingDays: [{ dayLabel: "Day 3", pairings }],
  countBlocks: [],
  groupBlocks: [],
  groupBy: "session",
  holes: [],
};

describe("buildPrintBook", () => {
  it("one day: one start sheet, labelled and named for that day", () => {
    const result = buildPrintBook(base);
    expect(result?.book.tables).toHaveLength(1);
    expect(result?.book.label).toBe("Start sheet · Day 3");
    expect(result && printFileName(result, "xlsx")).toBe(
      "24th-bamboo-tee_start-sheet_day-3_2026-11-14.xlsx",
    );
  });

  it("all days: one sheet per day that has players, file named all-days", () => {
    const result = buildPrintBook({
      ...base,
      boards: [
        board(1, [group(1, "06:30", ["Ana"])]),
        board(2, []),
        board(3, [group(1, "12:30", ["Cy"])]),
      ],
    });
    expect(result?.book.tables).toHaveLength(2);
    expect(result?.book.label).toBe("Start sheet · All days");
    expect(result && printFileName(result, "pdf")).toBe("24th-bamboo-tee_start-sheet_all-days.pdf");
  });

  it("returns null instead of an empty file", () => {
    expect(buildPrintBook({ ...base, boards: [board(3, [])] })).toBeNull();
    expect(buildPrintBook({ ...base, kind: "pairings", pairingDays: [] })).toBeNull();
    expect(buildPrintBook({ ...base, kind: "counts" })).toBeNull();
  });

  it("pairings follow the days it is given", () => {
    const result = buildPrintBook({ ...base, kind: "pairings" });
    expect(result?.book.tables[0]?.title).toContain("Day 3");
  });

  it("scorecards come back as pages for the PDF writer only", () => {
    const result = buildPrintBook({ ...base, kind: "scorecards" });
    expect(result?.scorecards).toHaveLength(1);
    expect(result?.book.tables).toEqual([]);
  });

  it("confirmed scorecards are never stamped as a draft, whatever the pairings state", () => {
    const result = buildPrintBook({ ...base, kind: "scorecards", course: "official" });
    expect(result?.book.status).toBe("Course data confirmed");
    expect(result?.book.status).not.toMatch(/draft/i);
  });

  it("scorecards with unconfirmed course data say so instead of calling themselves a draft", () => {
    expect(
      buildPrintBook({ ...base, kind: "scorecards", course: "placeholder" })?.book.status,
    ).toBe("Course data not confirmed");
    expect(buildPrintBook({ ...base, kind: "scorecards", course: "missing" })?.book.status).toBe(
      "Course data not entered",
    );
  });

  it("the start sheet and pairings keep the publish state", () => {
    expect(buildPrintBook(base)?.book.status).toBe("Draft · not published");
    expect(buildPrintBook({ ...base, kind: "pairings" })?.book.status).toBe(
      "Draft · not published",
    );
  });
});
