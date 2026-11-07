import { describe, expect, it } from "vitest";
import { type PublishedGroupShape, groupMates } from "./group";

const group = (hole: number, time: string, names: string[]): PublishedGroupShape => ({
  startHole: hole,
  time,
  players: names,
});

describe("published group mates", () => {
  it("returns the others in the player's own group, in capitals like the sheet", () => {
    const groups = [
      group(10, "06:30", ["Antonio Alcantara", "Benjamin Bautista"]),
      group(10, "06:40", ["Carlos Castillo"]),
    ];
    expect(groupMates(groups, { name: "Antonio Alcantara", time: "06:30", hole: 10 })).toEqual([
      "BENJAMIN BAUTISTA",
    ]);
  });

  it("does not invent a group when the time or hole does not match", () => {
    const groups = [group(10, "06:30", ["Antonio Alcantara", "Benjamin Bautista"])];
    expect(groupMates(groups, { name: "Antonio Alcantara", time: "07:00", hole: 10 })).toEqual([]);
    expect(groupMates(groups, { name: "Antonio Alcantara", time: null, hole: 10 })).toEqual([]);
  });

  it("falls back to the matching start when the name is not in the snapshot", () => {
    const groups = [group(10, "06:30", ["Benjamin Bautista"])];
    expect(groupMates(groups, { name: "Someone Else", time: "06:30", hole: 10 })).toEqual([
      "BENJAMIN BAUTISTA",
    ]);
  });
});
