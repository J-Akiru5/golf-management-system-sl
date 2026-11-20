import { describe, expect, it } from "vitest";
import { initials, toneFor } from "./avatar-initials";

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Mia Member")).toBe("MM");
    expect(initials("Jeff Martinez Reyes")).toBe("JR");
  });

  it("takes one letter from a single name", () => {
    expect(initials("Cher")).toBe("C");
  });

  it("ignores extra spaces and case", () => {
    expect(initials("  mia   member ")).toBe("MM");
  });

  it("returns nothing for an empty name", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });
});

describe("toneFor", () => {
  it("is stable for the same id", () => {
    expect(toneFor("user-1")).toBe(toneFor("user-1"));
  });

  it("is a class string from the token palette", () => {
    expect(toneFor("user-1")).toMatch(/^bg-/);
  });

  it("spreads a handful of ids over more than one tone", () => {
    const tones = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(toneFor));
    expect(tones.size).toBeGreaterThan(1);
  });
});
