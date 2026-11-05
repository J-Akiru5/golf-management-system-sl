import { describe, expect, it } from "vitest";
import { courseHandicap } from "./handicap";
import type { Tee } from "./types";

/**
 * Checks the computed course handicap against the club's printed WHS tables, read from the sheets
 * the tournament supplied. The sheets are the formula rounded half up:
 *
 *   Course handicap = Index x (Slope / 113) + (Course Rating - Par)
 *
 * Men 70 and over play the Silver markers but use the White conversion, so there is no separate
 * Silver table here.
 */
const blue: Tee = { id: "blue", name: "Men's Blue", courseRating: 69.6, slope: 130, par: 70 };
const white: Tee = { id: "white", name: "Men's White", courseRating: 67.9, slope: 127, par: 70 };
const red: Tee = { id: "red", name: "Women's Red", courseRating: 72.1, slope: 126, par: 70 };

describe("course handicap against the printed tables", () => {
  it("matches Men's Blue", () => {
    const cases: [number, number][] = [
      [-5.0, -6],
      [-0.9, -1],
      [0.0, 0],
      [0.8, 1],
      [4.3, 5],
      [5.2, 6],
      [12.1, 14],
      [22.6, 26],
      [51.2, 59],
      [53.9, 62],
    ];
    for (const [index, expected] of cases) {
      expect(courseHandicap(index, blue), `Blue index ${index}`).toBe(expected);
    }
  });

  it("matches Men's White", () => {
    const cases: [number, number][] = [
      [-5.0, -8],
      [1.5, 0],
      [2.4, 1],
      [10.4, 10],
      [17.5, 18],
      [34.4, 37],
      [52.2, 57],
    ];
    for (const [index, expected] of cases) {
      expect(courseHandicap(index, white), `White index ${index}`).toBe(expected);
    }
  });

  it("matches Women's Red", () => {
    const cases: [number, number][] = [
      [-5.0, -3],
      [0.4, 3],
      [2.2, 5],
      [4.9, 8],
      [25.5, 31],
      [53.3, 62],
    ];
    for (const [index, expected] of cases) {
      expect(courseHandicap(index, red), `Red index ${index}`).toBe(expected);
    }
  });
});
