import { describe, expect, it } from "vitest";
import { carouselSlides } from "./slides";

describe("carouselSlides", () => {
  it("adds the empty card when there are no open events", () => {
    expect(carouselSlides([])).toEqual([null]);
  });

  it("pairs a single event with the empty card", () => {
    expect(carouselSlides(["a"])).toEqual(["a", null]);
  });

  it("shows two or more events as they are, with no invented card", () => {
    expect(carouselSlides(["a", "b"])).toEqual(["a", "b"]);
    expect(carouselSlides(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("keeps the strip to one card when there is nothing at all, and two once there is one", () => {
    expect(carouselSlides([])).toHaveLength(1);
    expect(carouselSlides(["a"])).toHaveLength(2);
    expect(carouselSlides(["a", "b"])).toHaveLength(2);
    expect(carouselSlides(["a", "b", "c"])).toHaveLength(3);
  });
});
