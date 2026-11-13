import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

// Windows checkouts (core.autocrlf) give CRLF line endings; the token search expects LF.
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** The hex value of `--name` in the first rule that starts with `selector {`. */
function token(selector: string, name: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No rule for ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  const match = body.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`No --${name} in ${selector}`);
  return (match[1] as string).toUpperCase();
}

/**
 * The installed app is its own branding surface: the name on the home screen, the two colours the
 * launcher and splash use, and the files behind the icons. None of it goes through a render, so
 * nothing else in the suite would notice a wrong theme colour or a deleted icon.
 */
describe("the installable app's branding", () => {
  const app = manifest();

  it("is TeeLine, not a generic name or the club's own", () => {
    expect(app.name).toBe("TeeLine Golf · IGCC");
    expect(app.short_name).toBe("TeeLine");
    expect(app.description).toContain("Iloilo Golf & Country Club");
  });

  it("opens on the player's own screen", () => {
    expect(app.start_url).toBe("/my");
    expect(app.scope).toBe("/");
    expect(app.display).toBe("standalone");
  });

  // The manifest cannot use CSS variables, so these two literals are the one place the brand
  // colours are repeated. They must stay equal to the tokens the app renders with.
  it("takes its theme and background colours from the token set", () => {
    expect(app.theme_color?.toUpperCase()).toBe(token(":root", "forest"));
    expect(app.background_color?.toUpperCase()).toBe(token(":root", "surface"));
  });

  it("points at icon files that exist and cover the installed and maskable slots", () => {
    const icons = app.icons ?? [];
    expect(icons.map((icon) => icon.sizes).sort()).toEqual(["192x192", "512x512", "512x512"]);
    expect(icons.filter((icon) => icon.purpose === "maskable")).toHaveLength(1);
    for (const icon of icons) {
      const path = new URL(`../../public/${icon.src?.replace(/^\//, "")}`, import.meta.url);
      expect(existsSync(path), `${icon.src} is missing from public/`).toBe(true);
    }
  });

  it("offers the staff desk and the player screen as shortcuts", () => {
    expect(app.shortcuts?.map((shortcut) => shortcut.url)).toEqual([
      "/staff",
      "/my",
      "/pairings",
      "/leaderboard",
    ]);
  });
});
