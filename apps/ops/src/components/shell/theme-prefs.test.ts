import { describe, expect, it } from "vitest";
import { parseTheme, THEME_BOOT_SCRIPT, THEME_KEY } from "./theme-prefs";

describe("parseTheme", () => {
  it("accepts only the two explicit choices", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("treats anything else as System", () => {
    expect(parseTheme("auto")).toBe("auto");
    expect(parseTheme("")).toBe("auto");
    expect(parseTheme(null)).toBe("auto");
    expect(parseTheme(undefined)).toBe("auto");
    expect(parseTheme("blue")).toBe("auto");
  });
});

describe("THEME_BOOT_SCRIPT", () => {
  it("reads only the documented key", () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_KEY);
  });
});
