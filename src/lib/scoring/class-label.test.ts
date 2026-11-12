import { describe, expect, it } from "vitest";
import { classLabel } from "./class-label";

describe("classLabel", () => {
  it("prints the class name as loaded", () => {
    expect(classLabel("Class A")).toBe("Class A");
  });

  it("says No class when the player has no class", () => {
    expect(classLabel(null)).toBe("No class");
  });

  it("says No class when the view did not load a class", () => {
    expect(classLabel(undefined)).toBe("No class");
  });
});
