import { describe, expect, it } from "vitest";
import {
  comparePrintDays,
  displayDayLabel,
  formatLine,
  holeGridRows,
  isFinalPlayingDay,
  lastPlayingDayNumber,
  orderedPrintDays,
  pageLabel,
  paginate,
  posterColumns,
  sheetLabel,
  shortPlayDate,
  splitIntoSessions,
  versionLine,
} from "./sheets";

const days = [
  { dayNumber: 10, label: "Day 10", playDate: "2026-11-21" },
  { dayNumber: 2, label: "D2", playDate: "2026-11-13" },
  { dayNumber: 1, label: "D1", playDate: "2026-11-12" },
];

describe("day order and labels", () => {
  it("sorts D2 before D10, not as text", () => {
    const labels = orderedPrintDays(days).map((day) => day.label);
    expect(labels).toEqual(["D1", "D2", "Day 10"]);
    expect(comparePrintDays(days[0]!, days[1]!)).toBeGreaterThan(0);
  });

  it("falls back to the day number when labels have no number", () => {
    const ordered = orderedPrintDays([
      { dayNumber: 3, playDate: "2026-11-14" },
      { dayNumber: 1, playDate: "2026-11-12" },
    ]);
    expect(ordered.map((day) => day.dayNumber)).toEqual([1, 3]);
  });

  it("writes Day 2 from a D2 label and reads the date in UTC", () => {
    expect(displayDayLabel({ dayNumber: 2, label: "D2" })).toBe("Day 2");
    expect(displayDayLabel({ dayNumber: 2 })).toBe("Day 2");
    expect(shortPlayDate("2026-11-13")).toBe("Fri 13 Nov");
    expect(shortPlayDate(null)).toBe("");
  });

  it("labels a sheet with day, date and session", () => {
    expect(sheetLabel({ dayNumber: 2, label: "D2", playDate: "2026-11-13" }, "PM")).toBe(
      "Day 2 · Fri 13 Nov · PM",
    );
  });

  it("treats the last day by latest date, not by list length", () => {
    const playing = [
      { dayNumber: 1, label: "D1", playDate: "2026-11-12" },
      { dayNumber: 2, label: "D2", playDate: "2026-11-13" },
    ];
    expect(lastPlayingDayNumber(playing)).toBe(2);
    expect(isFinalPlayingDay(playing[1]!, playing)).toBe(true);
    expect(isFinalPlayingDay(playing[0]!, playing)).toBe(false);
  });

  it("does not let an unsorted date list move the final day", () => {
    const unsorted = [
      { dayNumber: 2, label: "D2", playDate: "2026-11-13" },
      { dayNumber: 1, label: "D1", playDate: "2026-11-12" },
    ];
    expect(isFinalPlayingDay(unsorted[0]!, unsorted)).toBe(true);
    expect(isFinalPlayingDay(unsorted[1]!, unsorted)).toBe(false);
  });
});

describe("day and session sheets", () => {
  const groups = [
    { id: "p1", dayNumber: 1, startHole: 1, number: 1, time: "06:30" },
    { id: "p2", dayNumber: 1, startHole: 2, number: 2, time: "12:30" },
    { id: "p3", dayNumber: 2, startHole: 1, number: 3, time: "06:30" },
    { id: "p4", dayNumber: 2, startHole: 2, number: 4, time: "11:30" },
  ];

  it("makes one sheet per day and session, AM before PM", () => {
    const sheets = splitIntoSessions(groups, days);
    expect(sheets.map((sheet) => [sheet.dayNumber, sheet.session, sheet.groups.length])).toEqual([
      [1, "AM", 1],
      [1, "PM", 1],
      [2, "AM", 2],
    ]);
  });

  it("never mixes two days on one sheet", () => {
    const sheets = splitIntoSessions(groups, days);
    for (const sheet of sheets) {
      expect(sheet.groups.every((group) => group.dayNumber === sheet.dayNumber)).toBe(true);
    }
  });

  it("uses the final day's earlier afternoon start", () => {
    const twoDays = days.filter((day) => day.dayNumber <= 2);
    const sheets = splitIntoSessions(
      [
        { id: "am", dayNumber: 2, startHole: 1, number: 1, time: "06:30" },
        { id: "pm", dayNumber: 2, startHole: 2, number: 2, time: "11:30" },
      ],
      twoDays,
    );
    // 11:30 is the afternoon on the final day, 13 Nov here.
    const last = sheets.find((sheet) => sheet.dayNumber === 2 && sheet.session === "PM");
    expect(last?.groups.map((group) => group.id)).toEqual(["pm"]);
    expect(last?.finalDay).toBe(true);
    expect(last?.dayLabel).toBe("Day 2");
  });

  it("keeps an unreadable time as its own sheet instead of guessing AM", () => {
    const sheets = splitIntoSessions([{ dayNumber: 1, time: "TBC" }], days);
    expect(sheets.map((sheet) => sheet.session)).toEqual(["TBD"]);
    expect(sheets[0]?.label).toBe("Day 1 · Thu 12 Nov · No tee time");
  });
});

describe("paging and paper helpers", () => {
  it("splits a field into numbered pages and keeps the last page short", () => {
    const pages = paginate([1, 2, 3, 4, 5], 2);
    expect(pages).toEqual([[1, 2], [3, 4], [5]]);
    expect(pageLabel(2, pages.length)).toBe("Page 2 of 3");
    expect(pageLabel(1, 0)).toBe("Page 1 of 1");
  });

  it("does not mutate the field", () => {
    const items = [1, 2, 3];
    paginate(items, 2);
    expect(items).toEqual([1, 2, 3]);
  });

  it("builds a hole grid in hole order with A and B slots", () => {
    const rows = holeGridRows([
      { number: 2, startHole: 1, time: "07:00" },
      { number: 1, startHole: 1, time: "06:30" },
      { number: 3, startHole: 10, time: "06:30" },
    ]);
    expect(rows.map((row) => row.hole)).toEqual([1, 10]);
    expect(rows[0]?.cells.map((cell) => [cell.slot, cell.group.number])).toEqual([
      ["A", 1],
      ["B", 2],
    ]);
  });

  it("splits the notice board into two reading columns", () => {
    expect(posterColumns([1, 2, 3, 4, 5])).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it("prints the format line", () => {
    expect(formatLine("shotgun", "06:30")).toBe("Shotgun start · first tee 06:30");
    expect(formatLine("two_tee", "")).toBe("Two-tee start");
  });

  it("stamps a published version and says draft when unpublished", () => {
    expect(versionLine({ version: 3, at: "2026-11-08T00:05:00.000Z" })).toContain(
      "Published version 3",
    );
    expect(versionLine(null)).toBe("Not published · working draft");
  });
});
