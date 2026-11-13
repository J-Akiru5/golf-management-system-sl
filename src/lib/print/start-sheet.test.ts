import { describe, expect, it } from "vitest";
import {
  groupSessions,
  groupStartGroups,
  type SortableStartGroup,
  sortStartGroups,
} from "./start-sheet";

const groups: SortableStartGroup[] = [
  { number: 4, startHole: 1, time: "12:00" },
  { number: 3, startHole: 10, time: "07:00" },
  { number: 2, startHole: 2, time: "07:00" },
  { number: 1, startHole: 1, time: "07:00" },
];

describe("start-sheet sorting", () => {
  it("orders shotgun groups by start time, then starting hole", () => {
    expect(sortStartGroups(groups, "shotgun").map((group) => group.number)).toEqual([1, 2, 3, 4]);
  });

  it("groups shotgun starts by the time they tee off", () => {
    expect(
      groupStartGroups(groups, "shotgun").map((section) => [section.time, section.groups.length]),
    ).toEqual([
      ["07:00", 3],
      ["12:00", 1],
    ]);
  });

  it("keeps two starts inside one session apart", () => {
    const morning: SortableStartGroup[] = [
      { number: 1, startHole: 1, time: "06:30" },
      { number: 2, startHole: 2, time: "06:30" },
      { number: 3, startHole: 1, time: "06:45" },
    ];
    expect(
      groupStartGroups(morning, "shotgun").map((section) => [
        section.time,
        section.groups.map((group) => group.number),
      ]),
    ).toEqual([
      ["06:30", [1, 2]],
      ["06:45", [3]],
    ]);
  });

  it("orders two-tee starts by time then hole and groups concurrent tees together", () => {
    const twoTee = [
      { ...groups[0]!, startHole: 10 },
      { ...groups[1]!, startHole: 10 },
      { ...groups[2]!, startHole: 1, time: "06:48" },
      { ...groups[3]!, startHole: 1 },
    ];

    expect(sortStartGroups(twoTee, "two_tee").map((group) => group.number)).toEqual([2, 1, 3, 4]);
    expect(
      groupStartGroups(twoTee, "two_tee").map((section) => [section.time, section.groups.length]),
    ).toEqual([
      ["06:48", 1],
      ["07:00", 2],
      ["12:00", 1],
    ]);
  });

  it("does not mutate the caller's array", () => {
    const input = [...groups];
    sortStartGroups(input, "shotgun");
    expect(input).toEqual(groups);
  });
});

describe("start-sheet sessions and flights", () => {
  const day: SortableStartGroup[] = [
    { number: 3, startHole: 4, time: "06:12" },
    { number: 1, startHole: 9, time: "06:00" },
    { number: 2, startHole: 1, time: "06:00" },
    { number: 5, startHole: 2, time: "12:42" },
    { number: 4, startHole: 3, time: "12:30" },
    { number: 6, startHole: 1, time: "12:30" },
  ];

  it("puts the morning and the afternoon on separate sheets, morning first", () => {
    const sessions = groupSessions(day, "shotgun");
    expect(sessions.map((s) => s.label)).toEqual(["AM", "PM"]);
    expect(sessions.map((s) => s.key)).toEqual(["am", "pm"]);
  });

  it("calls the first wave of a session Flight A and the next Flight B", () => {
    const [am, pm] = groupSessions(day, "shotgun");
    expect(am?.flights.map((f) => [f.name, f.time])).toEqual([
      ["Flight A", "06:00"],
      ["Flight B", "06:12"],
    ]);
    expect(pm?.flights.map((f) => [f.name, f.time])).toEqual([
      ["Flight A", "12:30"],
      ["Flight B", "12:42"],
    ]);
  });

  it("lists each flight's groups in hole order", () => {
    const [am, pm] = groupSessions(day, "shotgun");
    expect(am?.flights[0]?.groups.map((g) => g.startHole)).toEqual([1, 9]);
    expect(pm?.flights[0]?.groups.map((g) => g.startHole)).toEqual([1, 3]);
  });

  it("leaves out a session that has no groups", () => {
    const morningOnly = groupSessions(
      day.filter((g) => g.time < "12:00"),
      "shotgun",
    );
    expect(morningOnly.map((s) => s.label)).toEqual(["AM"]);
    expect(groupSessions([], "shotgun")).toEqual([]);
  });

  it("keeps a day with one wave per session as Flight A only", () => {
    const sessions = groupSessions(
      [
        { number: 1, startHole: 1, time: "06:30" },
        { number: 2, startHole: 1, time: "12:30" },
      ],
      "shotgun",
    );
    expect(sessions.map((s) => s.flights.map((f) => f.name))).toEqual([["Flight A"], ["Flight A"]]);
  });

  it("prints every group exactly once and does not mutate the input", () => {
    const input = [...day];
    const numbers = groupSessions(input, "shotgun").flatMap((s) =>
      s.flights.flatMap((f) => f.groups.map((g) => g.number)),
    );
    expect(numbers.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(input).toEqual(day);
  });
});

/**
 * A start sheet is a piece of paper. Paging is for the desk's screens, so the count of players the
 * sheet is built from must equal the count that reaches the organizer's hands, however large the
 * field. These tests fix that invariant at a size well over one screen page.
 */
describe("start sheet completeness", () => {
  interface PrintGroup extends SortableStartGroup {
    players: { id: string }[];
  }

  /** A field of `playerCount` players in groups of four, split across two start times. */
  function fieldOf(playerCount: number, size = 4): PrintGroup[] {
    const groups: PrintGroup[] = [];
    for (let i = 0; i < playerCount; i += size) {
      const number = groups.length + 1;
      groups.push({
        number,
        startHole: ((number - 1) % 18) + 1,
        time: number % 2 === 0 ? "12:00" : "07:00",
        players: Array.from({ length: Math.min(size, playerCount - i) }, (_, k) => ({
          id: `p${i + k + 1}`,
        })),
      });
    }
    return groups;
  }

  const printed = (groups: PrintGroup[], format: "shotgun" | "two_tee") =>
    groupStartGroups(groups, format).flatMap((section) =>
      section.groups.flatMap((group) => group.players.map((p) => p.id)),
    );

  it("prints every player of a 126-strong field, not just the first page of 50", () => {
    const field = fieldOf(126); // 32 groups
    expect(field).toHaveLength(32);

    for (const format of ["shotgun", "two_tee"] as const) {
      const rows = printed(field, format);
      expect(rows).toHaveLength(126);
      expect(new Set(rows).size).toBe(126);
      // The first page must not be the whole sheet.
      expect(rows.length).toBeGreaterThan(50);
    }
  });

  it("keeps the field intact when the last group is short", () => {
    const field = fieldOf(126); // 31 full groups of four, then one of two
    expect(field.at(-1)?.players).toHaveLength(2);
    expect(printed(field, "shotgun")).toHaveLength(126);
  });

  it("covers the whole field once: nobody is dropped between sections", () => {
    const field = fieldOf(126);
    const inOrder = printed(field, "shotgun");
    // Every player appears exactly once, so no group was lost or listed twice.
    expect(new Set(inOrder).size).toBe(inOrder.length);
    expect([...inOrder].sort()).toEqual(Array.from({ length: 126 }, (_, i) => `p${i + 1}`).sort());
  });

  it("prints in play order, which paging could never preserve", () => {
    const field = fieldOf(12); // three groups: 1 and 3 in the AM wave, 2 in the PM
    const sections = groupStartGroups(field, "shotgun");
    const numbers = sections.flatMap((s) => s.groups.map((g) => g.number));
    // The morning start plays first in hole order, then the afternoon one. Paging the desk's list
    // would have reordered these by row, not by when the field actually tees off.
    expect(numbers).toEqual([1, 3, 2]);
    expect(sections.map((s) => s.time)).toEqual(["07:00", "12:00"]);
  });
});
