import { describe, expect, it } from "vitest";
import { groupStartGroups, type SortableStartGroup, sortStartGroups } from "./start-sheet";

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
