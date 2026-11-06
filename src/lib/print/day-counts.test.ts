import { describe, expect, it } from "vitest";
import {
  buildDayCountBlocks,
  buildGroupBlocks,
  type CountEntry,
  sessionOfEntry,
  sessionOfWave,
  tallyDay,
} from "./day-counts";

const days = [
  { dayNumber: 1, label: "Day 1", playDate: "2026-11-05" },
  { dayNumber: 2, label: "Day 2", playDate: "2026-11-06" },
  { dayNumber: 3, label: "Day 3", playDate: "2026-11-07" },
  { dayNumber: 4, label: "Day 4", playDate: "2026-11-08" },
];

function entry(over: Partial<CountEntry> & { entryId: string }): CountEntry {
  const { entryId, ...rest } = over;
  return { playerId: `p-${entryId}`, entryId, ...rest };
}

describe("sessionOfEntry", () => {
  it("takes the desk's AM/PM choice", () => {
    expect(sessionOfEntry(entry({ entryId: "a", daySessions: { 3: "PM" } }), 3, 2, 4)).toBe("PM");
  });

  it("reads the session back from the tee time when the desk has not chosen", () => {
    expect(
      sessionOfEntry(
        entry({ entryId: "b", dayTee: { 3: { teeTime: "06:30", startHole: 4 } } }),
        3,
        2,
        4,
      ),
    ).toBe("AM");
    expect(
      sessionOfEntry(
        entry({ entryId: "c", dayTee: { 3: { teeTime: "12:45", startHole: 4 } } }),
        3,
        2,
        4,
      ),
    ).toBe("PM");
  });

  it("stays unset when there is neither a choice nor a time", () => {
    expect(
      sessionOfEntry(entry({ entryId: "d", daySessions: {}, dayTee: {} }), 3, 2, 4),
    ).toBeNull();
    expect(sessionOfEntry(entry({ entryId: "e" }), 3, 2, 4)).toBeNull();
  });

  it("only trusts a real session value", () => {
    const stray = entry({
      entryId: "f",
      daySessions: { 3: "XX" as unknown as "AM" },
    });
    expect(sessionOfEntry(stray, 3, 2, 4)).toBeNull();
  });
});

describe("tallyDay", () => {
  const entries: CountEntry[] = [
    entry({ entryId: "1", selectedDays: [3], daySessions: { 3: "AM" } }),
    entry({ entryId: "2", selectedDays: [3], daySessions: { 3: "AM" } }),
    entry({ entryId: "3", selectedDays: [3], daySessions: { 3: "PM" } }),
    entry({ entryId: "4", selectedDays: [1, 3] }),
    entry({ entryId: "5", selectedDays: [4], daySessions: { 4: "AM" } }),
  ];

  it("counts only the players who selected that day", () => {
    expect(tallyDay(entries, 3, 2, 4)).toEqual({ am: 2, pm: 1, unset: 1, total: 4 });
  });

  it("returns zeros for a day nobody selected", () => {
    expect(tallyDay(entries, 2, 1, 4)).toEqual({ am: 0, pm: 0, unset: 0, total: 0 });
  });
});

describe("buildDayCountBlocks", () => {
  it("builds one block per day, in tee-off order, with names and sessions", () => {
    const blocks = buildDayCountBlocks({
      days,
      entries: [
        entry({
          entryId: "late",
          playerId: "late",
          selectedDays: [3],
          dayTee: { 3: { teeTime: "12:30", startHole: 1 } },
        }),
        entry({
          entryId: "early",
          playerId: "early",
          selectedDays: [3],
          dayTee: { 3: { teeTime: "06:30", startHole: 4 } },
        }),
        entry({ entryId: "none", playerId: "none", selectedDays: [3] }),
      ],
      players: [
        { id: "late", name: "Late Player" },
        { id: "early", name: "Early Player" },
        { id: "none", name: "Unassigned Player" },
      ],
    });

    expect(blocks.map((block) => block.dayNumber)).toEqual([1, 2, 3, 4]);
    const day3 = blocks[2];
    expect(day3?.tally).toEqual({ am: 1, pm: 1, unset: 1, total: 3 });
    expect(day3?.rows.map((row) => row.name)).toEqual([
      "Early Player",
      "Late Player",
      "Unassigned Player",
    ]);
    expect(day3?.rows.map((row) => row.session)).toEqual(["AM", "PM", null]);
    expect(day3?.rows[0]?.startHole).toBe(4);
  });
});

describe("draw pairings", () => {
  it("reads AM or PM from the group's wave label", () => {
    expect(sessionOfWave("D3-PM-A")).toBe("PM");
    expect(sessionOfWave("D3-AM-A")).toBe("AM");
    expect(sessionOfWave(null)).toBeNull();
  });

  it("uses the pairing's time and hole for the sheet", () => {
    const blocks = buildDayCountBlocks({
      days,
      entries: [entry({ entryId: "a", playerId: "a", selectedDays: [3] })],
      players: [{ id: "a", name: "Drawn Player" }],
      boards: [
        {
          day: 3,
          groups: [{ time: "06:45", startHole: 7, wave: "D3-AM-A", players: [{ id: "a" }] }],
        },
      ],
    });
    expect(blocks[2]?.rows[0]).toMatchObject({ session: "AM", teeTime: "06:45", startHole: 7 });
    expect(blocks[2]?.tally).toEqual({ am: 1, pm: 0, unset: 0, total: 1 });
  });

  it("lets a stored per-day time win over the pairing", () => {
    const blocks = buildDayCountBlocks({
      days,
      entries: [
        entry({
          entryId: "b",
          playerId: "b",
          selectedDays: [3],
          dayTee: { 3: { teeTime: "12:30", startHole: 2 } },
        }),
      ],
      players: [{ id: "b", name: "Moved Player" }],
      boards: [
        {
          day: 3,
          groups: [{ time: "06:45", startHole: 7, wave: "D3-AM-A", players: [{ id: "b" }] }],
        },
      ],
    });
    expect(blocks[2]?.rows[0]).toMatchObject({ session: "PM", teeTime: "12:30", startHole: 2 });
  });
});

describe("buildGroupBlocks", () => {
  it("lists each day's groups in tee order with their session and players", () => {
    const blocks = buildGroupBlocks({
      days,
      boards: [
        {
          day: 3,
          groups: [
            {
              number: 9,
              startHole: 12,
              wave: "D3-PM-A",
              time: "12:30",
              flight: "Class C",
              players: [{ id: "x", name: "Afternoon Player" }],
            },
            {
              number: 2,
              startHole: 4,
              wave: "D3-AM-A",
              time: "06:30",
              flight: "Class A",
              players: [{ id: "y", name: "Morning Player" }],
            },
          ],
        },
      ],
    });

    expect(blocks).toHaveLength(4);
    const day3 = blocks[2];
    expect(day3?.groups.map((group) => group.number)).toEqual([2, 9]);
    expect(day3?.groups.map((group) => group.session)).toEqual(["AM", "PM"]);
    expect(day3?.groups[0]?.players[0]?.name).toBe("Morning Player");
    expect(day3?.groups[0]?.flight).toBe("Class A");
  });

  it("returns an empty day when the board is not loaded", () => {
    expect(buildGroupBlocks({ days }).every((block) => block.groups.length === 0)).toBe(true);
  });
});
