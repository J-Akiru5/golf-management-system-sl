import { describe, expect, it } from "vitest";
import { capPlayingHandicap, courseHandicap, playingHandicap } from "./handicap";
import type { Tee } from "./types";

/**
 * The owner's rule of 14 Nov 2026: nobody plays off more than the event maximum. The index is
 * capped first, and the playing handicap the tee formula gives is capped as well, so an index of 30
 * on the Blue tee plays off 30 even though the club's table reads 34.
 */
const blue: Tee = { id: "blue", name: "Men's Blue", courseRating: 69.6, slope: 130, par: 70 };

describe("the playing handicap cap", () => {
  it("shows the table figure that the cap is for", () => {
    expect(courseHandicap(30, blue)).toBe(34);
    expect(playingHandicap(30, blue, 1)).toBe(34);
  });

  it("holds a playing handicap to the maximum", () => {
    expect(playingHandicap(30, blue, 1, 30)).toBe(30);
    expect(playingHandicap(29.7, blue, 1, 30)).toBe(30);
    expect(playingHandicap(40, blue, 1, 30)).toBe(30);
  });

  it("leaves a handicap under the maximum alone, to the stroke", () => {
    for (let tenths = -50; tenths <= 260; tenths += 1) {
      const index = tenths / 10;
      const plain = playingHandicap(index, blue, 1);
      if (plain <= 30) expect(playingHandicap(index, blue, 1, 30), `index ${index}`).toBe(plain);
    }
  });

  it("never raises a plus handicap", () => {
    expect(playingHandicap(-3.2, blue, 1, 30)).toBe(playingHandicap(-3.2, blue, 1));
    expect(capPlayingHandicap(-4, 30)).toBe(-4);
  });

  it("applies the allowance first and the maximum last", () => {
    // Index 30 at 95% is 34 x 0.95 = 32.3, rounded to 32, and then held at 30.
    expect(playingHandicap(30, blue, 0.95, 30)).toBe(30);
    // At 80% it is 27, which is under the maximum and stays.
    expect(playingHandicap(30, blue, 0.8, 30)).toBe(27);
  });

  it("takes the maximum from the caller and treats a missing one as no cap", () => {
    expect(playingHandicap(30, blue, 1, 24)).toBe(24);
    expect(playingHandicap(30, blue, 1, null)).toBe(34);
    expect(playingHandicap(30, blue, 1, undefined)).toBe(34);
    expect(capPlayingHandicap(34, Number.NaN)).toBe(34);
  });
});
