import { describe, expect, it } from "vitest";
import { groupStartGroups, type SortableStartGroup, sortStartGroups } from "./start-sheet";

const groups: SortableStartGroup[] = [
  { number: 4, wave: "B", startHole: 1, time: "12:00" },
  { number: 3, wave: "A", startHole: 10, time: "07:00" },
  { number: 2, wave: "A", startHole: 2, time: "07:00" },
  { number: 1, wave: "A", startHole: 1, time: "07:00" },
];

describe("start-sheet sorting", () => {
  it("orders shotgun groups by wave, then starting hole", () => {
    expect(sortStartGroups(groups, "shotgun").map((group) => group.number)).toEqual([1, 2, 3, 4]);
  });

  it("groups shotgun starts into waves", () => {
    expect(
      groupStartGroups(groups, "shotgun").map((section) => [section.wave, section.groups.length]),
    ).toEqual([
      ["A", 3],
      ["B", 1],
    ]);
  });

  it("orders two-tee starts by time then hole and groups concurrent tees together", () => {
    const twoTee = [
      { ...groups[0]!, wave: null, startHole: 10 },
      { ...groups[1]!, wave: null, startHole: 10 },
      { ...groups[2]!, wave: null, startHole: 1, time: "06:48" },
      { ...groups[3]!, wave: null, startHole: 1 },
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
