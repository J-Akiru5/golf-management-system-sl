import { describe, expect, it } from "vitest";
import { groupRowLabels, pairingsColumns } from "./pairings";

describe("groupRowLabels", () => {
  it("labels the first group on a hole plainly", () => {
    expect(groupRowLabels([{ startHole: 1 }, { startHole: 2 }, { startHole: 3 }])).toEqual([
      "HOLE 1",
      "HOLE 2",
      "HOLE 3",
    ]);
  });

  it("suffixes a second and third group on the same hole, as the club sheet does", () => {
    expect(
      groupRowLabels([{ startHole: 1 }, { startHole: 1 }, { startHole: 2 }, { startHole: 1 }]),
    ).toEqual(["HOLE 1", "HOLE 1B", "HOLE 2", "HOLE 1C"]);
  });

  it("names the tee for a two-tee start", () => {
    expect(groupRowLabels([{ startHole: 1 }, { startHole: 10 }], "TEE")).toEqual([
      "TEE 1",
      "TEE 10",
    ]);
  });

  it("stops inventing letters after Z", () => {
    const many = Array.from({ length: 28 }, () => ({ startHole: 1 }));
    expect(groupRowLabels(many).at(-1)).toBe("HOLE 1#28");
  });
});

describe("pairingsColumns", () => {
  it("follows the widest group, so a pairs field prints two name columns", () => {
    expect(pairingsColumns([2, 2, 1])).toBe(2);
  });

  it("prints the club's four columns for a four-ball", () => {
    expect(pairingsColumns([4, 3])).toBe(4);
  });

  it("never prints more than four columns, and never fewer than two", () => {
    expect(pairingsColumns([5, 4])).toBe(4);
    expect(pairingsColumns([])).toBe(2);
  });
});
