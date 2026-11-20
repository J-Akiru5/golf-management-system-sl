import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the copied brand tokens.
 *
 * `packages/brand/tokens.css` is a copy of the token blocks in the live app's
 * `src/app/globals.css`. If a value drifts, this fails and names it. The live file is the source:
 * change it first, then copy the change across.
 */

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const LIVE_CSS = join(repoRoot, "src", "app", "globals.css");
const BRAND_CSS = join(repoRoot, "packages", "brand", "tokens.css");

/** Every token block the brand package must carry, in the live file's own spelling. */
const BLOCKS = [
  ":root {",
  "@media (prefers-color-scheme: dark) {",
  ':root[data-theme="dark"] {',
  "@theme inline {",
];

function read(path: string): string {
  // Strip comments first: a comment can hold a colon inside a ratio such as 4.34:1 and would
  // otherwise be read as a declaration.
  return readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function block(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`missing token block: ${opener.trim()}`);
  const open = css.indexOf("{", start);
  // A top-level block closes at column zero. Nested blocks inside the media query are indented.
  const end = css.indexOf("\n}", open);
  if (open === -1 || end === -1) throw new Error(`unclosed token block: ${opener.trim()}`);
  return css.slice(open + 1, end);
}

/** `--name: value;` pairs from a block, keyed by name. */
function declarations(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of css.matchAll(/([-\w]+)\s*:\s*([^;{}]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    found[name] = value.trim();
  }
  return found;
}

describe("brand tokens", () => {
  const live = read(LIVE_CSS);
  const brand = read(BRAND_CSS);

  for (const opener of BLOCKS) {
    it(`matches the live file in ${opener.replace(/[{}]/g, "").trim()}`, () => {
      const expected = declarations(block(live, opener));
      const actual = declarations(block(brand, opener));

      // A parse that silently found nothing would make every comparison below vacuous.
      expect(Object.keys(expected).length).toBeGreaterThan(10);
      expect(actual).toEqual(expected);
    });
  }
});
