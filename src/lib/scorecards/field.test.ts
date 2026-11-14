import { describe, expect, it } from "vitest";
import { classFromAverage, normalizeClass, sessionFromTeeTime, teeCode, teeRatings } from "./field";

describe("classFromAverage", () => {
  it("uses the system bands", () => {
    expect(classFromAverage(0, 0)).toBe("A");
    expect(classFromAverage(12, 12)).toBe("A");
    expect(classFromAverage(13, 13)).toBe("B");
    expect(classFromAverage(18, 18)).toBe("B");
    expect(classFromAverage(19, 19)).toBe("C");
    expect(classFromAverage(23, 23)).toBe("C");
    expect(classFromAverage(24, 24)).toBe("D");
  });

  it("rounds the pair average", () => {
    expect(classFromAverage(12, 13)).toBe("B");
    expect(classFromAverage(18, 19)).toBe("C");
    expect(classFromAverage(23, 24)).toBe("D");
  });

  it("caps both indexes at 30", () => {
    expect(classFromAverage(40, 40)).toBe("D");
    expect(classFromAverage(40, 10)).toBe("C");
  });
});

describe("teeCode", () => {
  it("maps the system tee names to the scorecard letters", () => {
    expect(teeCode("White")).toBe("W");
    expect(teeCode("Blue")).toBe("B");
    expect(teeCode("Red")).toBe("L");
    expect(teeCode("Silver")).toBe("S");
  });

  it("keeps an unknown tee blank instead of guessing", () => {
    expect(teeCode("")).toBe("");
    expect(teeCode("Championship")).toBe("");
  });
});

describe("teeRatings", () => {
  it("keeps the tees a card can name, in card letters", () => {
    expect(
      teeRatings([
        { name: "Blue", course_rating: 69.6, slope: 130, par: 70 },
        { name: "White", course_rating: "67.9", slope: "127", par: "70" },
        { name: "Championship", course_rating: 72, slope: 135, par: 70 },
        { name: "Red", course_rating: 72.1, slope: 126, par: 70 },
        { name: "Blue", course_rating: 70, slope: 120, par: 70 },
      ]),
    ).toEqual([
      { code: "B", name: "Blue", courseRating: 69.6, slope: 130, par: 70 },
      { code: "L", name: "Red", courseRating: 72.1, slope: 126, par: 70 },
      { code: "W", name: "White", courseRating: 67.9, slope: 127, par: 70 },
    ]);
  });

  it("skips a tee with no usable rating instead of guessing one", () => {
    expect(
      teeRatings([
        { name: "Blue", course_rating: null, slope: 130, par: 70 },
        { name: "White", course_rating: 67.9, slope: 0, par: 70 },
        { name: "Red", course_rating: 72.1, slope: 126 },
        { name: "Silver", course_rating: 68.4, slope: 121, par: 70 },
      ]),
    ).toEqual([{ code: "S", name: "Silver", courseRating: 68.4, slope: 121, par: 70 }]);
  });

  it("answers with an empty list when there is nothing to read", () => {
    expect(teeRatings([])).toEqual([]);
    expect(teeRatings(null)).toEqual([]);
    expect(teeRatings([null, "Blue", 4])).toEqual([]);
  });
});

describe("sessionFromTeeTime", () => {
  it("splits the day at the event's afternoon start", () => {
    expect(sessionFromTeeTime("06:30:00", "12:30:00")).toBe("AM");
    expect(sessionFromTeeTime("11:59", "12:30")).toBe("AM");
    expect(sessionFromTeeTime("12:30:00", "12:30:00")).toBe("PM");
    expect(sessionFromTeeTime("14:00", "12:30")).toBe("PM");
  });

  it("stays blank when the group has no tee time", () => {
    expect(sessionFromTeeTime("", "12:30")).toBe("");
  });
});

describe("normalizeClass", () => {
  it("reads the stored flight labels", () => {
    expect(normalizeClass("A")).toBe("A");
    expect(normalizeClass("Class B")).toBe("B");
    expect(normalizeClass("C (19-23)")).toBe("C");
    expect(normalizeClass("D")).toBe("D");
  });

  it("returns blank when no class letter is present", () => {
    expect(normalizeClass("")).toBe("");
    expect(normalizeClass("Unclassified")).toBe("");
  });
});
