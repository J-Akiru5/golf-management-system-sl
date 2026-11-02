import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BRAND = join(process.cwd(), "public", "brand");
const files = readdirSync(BRAND).filter((name) => name.endsWith(".svg"));

/**
 * The marks are traced from the club's brand board, so no file may fall back to a live <text>
 * element: a machine without Manrope installed would draw Arial instead of the logo.
 */
describe("the TeeLine brand files", () => {
  it("ships the traced lockups, symbols and icons", () => {
    expect(files.sort()).toEqual(
      [
        "teeline-app-icon-forest.svg",
        "teeline-app-icon-ivory.svg",
        "teeline-horizontal-mono.svg",
        "teeline-horizontal-primary.svg",
        "teeline-horizontal-reverse.svg",
        "teeline-lockup-mono.svg",
        "teeline-lockup-primary.svg",
        "teeline-lockup-reverse.svg",
        "teeline-monogram.svg",
        "teeline-symbol-mono.svg",
        "teeline-symbol-primary.svg",
        "teeline-symbol-reverse.svg",
      ].sort(),
    );
  });

  it.each(files)("%s is outlined and has a viewBox", (file) => {
    const svg = readFileSync(join(BRAND, file), "utf8");
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("font-family");
    expect(svg).toMatch(/viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/);
    expect(svg).toContain("<title");
  });

  it("keeps the three lockup variants the same size", () => {
    const box = (file: string) =>
      readFileSync(join(BRAND, file), "utf8").match(/viewBox="([^"]+)"/)?.[1];
    expect(box("teeline-lockup-reverse.svg")).toBe(box("teeline-lockup-primary.svg"));
    expect(box("teeline-lockup-mono.svg")).toBe(box("teeline-lockup-primary.svg"));
  });
});
