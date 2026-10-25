import { describe, expect, it } from "vitest";
import {
  blankHoles,
  cardPar,
  courseDataStatus,
  courseNumbersChanged,
  holesComplete,
  parProblem,
  strokeIndexProblem,
  teeParMismatches,
} from "./course-data";
import type { Hole } from "./types";

const tees = [{ id: "w", name: "White", courseRating: 71.5, slope: 128, par: 72 }];

const card = (fill = true): Hole[] =>
  Array.from({ length: 18 }, (_, i) => ({
    id: `h${i + 1}`,
    courseId: "c",
    number: i + 1,
    par: fill ? 4 : null,
    strokeIndex: fill ? i + 1 : null,
  }));

describe("blankHoles", () => {
  it("builds 18 numbered rows with no par or stroke index invented", () => {
    const holes = blankHoles("course-1");
    expect(holes).toHaveLength(18);
    expect(holes.map((hole) => hole.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(holes.every((hole) => hole.par === null && hole.strokeIndex === null)).toBe(true);
    expect(holes.every((hole) => hole.courseId === "course-1")).toBe(true);
  });
});

describe("cardPar", () => {
  it("adds the pars that are on the card and ignores blanks", () => {
    expect(cardPar(card())).toBe(72);
    const holes = card();
    holes[3] = { ...holes[3]!, par: 5 };
    expect(cardPar(holes)).toBe(73);
    expect(cardPar(card(false))).toBe(0);
  });
});

describe("parProblem", () => {
  it("accepts par 3 to 6 and blanks", () => {
    expect(parProblem(card())).toBeNull();
    expect(parProblem(card(false))).toBeNull();
  });

  it("names a par outside the range the database accepts", () => {
    const holes = card();
    holes[0] = { ...holes[0]!, par: 2 };
    expect(parProblem(holes)).toMatch(/Hole 1 has par 2/);
    holes[0] = { ...holes[0]!, par: 7 };
    expect(parProblem(holes)).toMatch(/Hole 1 has par 7/);
  });
});

describe("teeParMismatches", () => {
  it("finds only the tees whose par differs from the card", () => {
    const mixed = [...tees, { id: "r", name: "Red", courseRating: 70, slope: 120, par: 70 }];
    expect(teeParMismatches(mixed, 70).map((tee) => tee.name)).toEqual(["White"]);
    expect(teeParMismatches(mixed, 72).map((tee) => tee.name)).toEqual(["Red"]);
    expect(teeParMismatches([], 70)).toEqual([]);
  });
});

describe("holesComplete", () => {
  it("needs all 18 holes with a par and a stroke index", () => {
    expect(holesComplete(card())).toBe(true);
    expect(holesComplete(card(false))).toBe(false);
    expect(holesComplete(card().slice(0, 17))).toBe(false);
  });

  it("does not count a repeated hole number as a full card", () => {
    const holes = card();
    holes[17] = { ...holes[17], number: 1 } as Hole;
    expect(holesComplete(holes)).toBe(false);
  });
});

describe("courseDataStatus", () => {
  it("is missing only when there are no tees to work a handicap from", () => {
    expect(courseDataStatus({ confirmed: true, tees: [], holes: card() })).toBe("missing");
  });

  it("is a placeholder, not missing, when tees exist but no holes are saved", () => {
    // The playing handicaps still rest on unchecked tee numbers, so the sheet must say so.
    expect(courseDataStatus({ confirmed: false, tees, holes: [] })).toBe("placeholder");
    expect(courseDataStatus({ confirmed: true, tees, holes: [] })).toBe("placeholder");
  });

  it("is a placeholder until the numbers are confirmed", () => {
    expect(courseDataStatus({ confirmed: false, tees, holes: card() })).toBe("placeholder");
  });

  it("is official only when confirmed and every hole is filled in", () => {
    expect(courseDataStatus({ confirmed: true, tees, holes: card() })).toBe("official");
  });

  it("never calls a card with blank holes official, even when confirmed", () => {
    expect(courseDataStatus({ confirmed: true, tees, holes: card(false) })).toBe("placeholder");
  });
});

describe("courseNumbersChanged", () => {
  const same = { tees, holes: card() };

  it("is false for the same numbers in a different order", () => {
    const reversed = { tees, holes: [...card()].reverse() };
    expect(courseNumbersChanged(same, reversed)).toBe(false);
  });

  it("notices a changed rating, slope, par or hole value", () => {
    expect(courseNumbersChanged(same, { tees: [{ ...tees[0]!, slope: 130 }], holes: card() })).toBe(
      true,
    );
    const holes = card();
    holes[3] = { ...holes[3]!, par: 5 };
    expect(courseNumbersChanged(same, { tees, holes })).toBe(true);
  });

  it("notices a tee that was added", () => {
    const more = [...tees, { id: "r", name: "Red", courseRating: 70, slope: 120, par: 72 }];
    expect(courseNumbersChanged(same, { tees: more, holes: card() })).toBe(true);
  });
});

describe("strokeIndexProblem", () => {
  it("accepts 1 to 18, each once, and ignores blanks", () => {
    expect(strokeIndexProblem(card())).toBeNull();
    expect(strokeIndexProblem(card(false))).toBeNull();
  });

  it("names a repeated stroke index and an out-of-range one", () => {
    const repeated = card();
    repeated[5] = { ...repeated[5]!, strokeIndex: 1 };
    expect(strokeIndexProblem(repeated)).toMatch(/used on holes 1 and 6/);
    const high = card();
    high[0] = { ...high[0]!, strokeIndex: 19 };
    expect(strokeIndexProblem(high)).toMatch(/outside 1 to 18/);
  });
});
