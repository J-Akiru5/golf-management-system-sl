import { describe, expect, it } from "vitest";
import { parseCardEntry } from "../entry";
import { TEST_HOLES } from "./fixtures";

function parCells(): Record<number, string> {
  return Object.fromEntries(TEST_HOLES.map((hole) => [hole.number, String(hole.par)]));
}

describe("parseCardEntry", () => {
  it("treats a blank hole as missing, never as zero or par", () => {
    const draft = parseCardEntry(TEST_HOLES, {});

    expect(draft.blankHoles).toHaveLength(18);
    expect(draft.invalidHoles).toHaveLength(0);
    expect(draft.writtenTotal).toBeNull();
    expect(draft.entries.every((entry) => entry.strokes === null)).toBe(true);
  });

  it("refuses a total while any hole is still blank", () => {
    const cells = parCells();
    // Twelve holes entered, six still empty on the card in front of the desk.
    for (const hole of TEST_HOLES.slice(12)) delete cells[hole.number];

    const draft = parseCardEntry(TEST_HOLES, cells);

    expect(draft.blankHoles).toEqual([13, 14, 15, 16, 17, 18]);
    expect(draft.writtenTotal).toBeNull();
  });

  it("shows the total only when every hole is present", () => {
    const draft = parseCardEntry(TEST_HOLES, parCells());

    expect(draft.blankHoles).toEqual([]);
    expect(draft.invalidHoles).toEqual([]);
    expect(draft.writtenTotal).toBe(72);
    expect(draft.entries).toHaveLength(18);
    expect(draft.entries.every((entry) => typeof entry.strokes === "number")).toBe(true);
  });

  it("flags a value that is not a whole score instead of reading it as a number", () => {
    const cells = parCells();
    cells[1] = "4.5";
    cells[2] = "0";
    cells[3] = "21";

    const draft = parseCardEntry(TEST_HOLES, cells);

    expect(draft.invalidHoles).toEqual([1, 2, 3]);
    expect(draft.writtenTotal).toBeNull();
  });

  it("keeps the entries in course order so the card matches the holes", () => {
    const draft = parseCardEntry(TEST_HOLES, parCells());

    expect(draft.entries.map((entry) => entry.hole)).toEqual(TEST_HOLES.map((hole) => hole.number));
  });
});
