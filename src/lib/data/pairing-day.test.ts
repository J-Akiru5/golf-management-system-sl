import { describe, expect, it } from "vitest";
import { datedHeading } from "./pairing-day";

describe("datedHeading", () => {
  it("adds the date to the end of a session heading", () => {
    expect(datedHeading("AM session", "Fri, Nov 13")).toBe("AM session · Fri, Nov 13");
  });

  it("adds the date to a multi-day heading that already names the day", () => {
    expect(datedHeading("Day 2 · AM", "Sat, Nov 14")).toBe("Day 2 · AM · Sat, Nov 14");
  });

  it("returns the heading unchanged when there is no date", () => {
    expect(datedHeading("PM session", null)).toBe("PM session");
    expect(datedHeading("PM session", undefined)).toBe("PM session");
    expect(datedHeading("PM session", "")).toBe("PM session");
    expect(datedHeading("PM session", "   ")).toBe("PM session");
  });
});
