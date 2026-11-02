import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BRAND = join(process.cwd(), "public", "brand");
const wordmarks = ["teeline-logo.svg", "teeline-logo-reverse.svg", "teeline-logo-mono.svg"];

/**
 * The wordmark files used to draw "TeeLine" and "GOLF" with <text> in Manrope. Anyone who opened
 * them without that font installed saw Arial, which is not the logo. They are outlined now, and
 * this test keeps them that way.
 */
describe("the brand wordmarks", () => {
  it.each(wordmarks)("%s is outlined, so it does not depend on an installed font", (file) => {
    const svg = readFileSync(join(BRAND, file), "utf8");
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("font-family");
    expect(svg).toContain('viewBox="0 0 440 128"');
    expect(svg).toContain("<title");
  });

  it("keeps the primary and reverse lockups the same size", () => {
    const light = readFileSync(join(BRAND, "teeline-logo.svg"), "utf8");
    const reverse = readFileSync(join(BRAND, "teeline-logo-reverse.svg"), "utf8");
    const paths = (svg: string) => svg.match(/<path d="/g)?.length ?? 0;
    expect(paths(light)).toBe(paths(reverse));
  });
});
