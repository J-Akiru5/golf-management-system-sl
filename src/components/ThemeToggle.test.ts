import { describe, expect, it } from "vitest";
import { parseTheme, THEME_CHOICES, THEME_INIT_SCRIPT, THEME_KEY } from "./ThemeToggle";

/**
 * The storage contract is what these guard: the key and the three values are what a saved choice
 * means across a deploy, and the pre-paint script reads exactly the same pair.
 */
describe("the theme choice", () => {
  it("offers System, Light and Dark, in the club's names too", () => {
    expect(THEME_CHOICES.map((c) => c.id)).toEqual(["auto", "light", "dark"]);
    expect(THEME_CHOICES.map((c) => c.label)).toEqual([
      "System",
      "Light (Ivory)",
      "Dark (Charcoal)",
    ]);
  });

  it("reads only an explicit light or dark as a choice, and everything else as System", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    for (const junk of [null, undefined, "", "auto", "LIGHT", "true"]) {
      expect(parseTheme(junk), String(junk)).toBe("auto");
    }
  });

  it("keeps the storage key and the pre-paint script in step", () => {
    expect(THEME_KEY).toBe("starter-theme");
    expect(THEME_INIT_SCRIPT).toContain(THEME_KEY);
    // System is the absence of the attribute, so only the two explicit values are written.
    expect(THEME_INIT_SCRIPT).toContain('t==="light"||t==="dark"');
  });
});
