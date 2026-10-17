import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Windows checkouts (core.autocrlf) give CRLF line endings; the block search below expects LF.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** Pulls `--token: value;` pairs out of the first rule that starts with `selector {`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No rule for ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1] as string] = m[2] as string;
  }
  return out;
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] as number) + 0.7152 * (ch[1] as number) + 0.0722 * (ch[2] as number);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio]. 4.5 for text, 3 for borders, icons and focus rings.
// Each pair is a claim made in the design system's token usage notes.
const SURFACES = ["surface", "surface-raised", "surface-sunken"];
const PAIRS: [string, string, number][] = [
  ...SURFACES.flatMap((bg): [string, string, number][] => [
    ["ink", bg, 4.5],
    ["ink-muted", bg, 4.5],
    ["fairway", bg, 4.5],
    ["gold-ink", bg, 4.5],
    ["success", bg, 4.5],
    ["warning", bg, 4.5],
    ["danger", bg, 4.5],
    ["info", bg, 4.5],
    ["line-strong", bg, 3],
    ["focus", bg, 3],
  ]),
  ["ink", "fairway-soft", 4.5],
  ["ink", "success-soft", 4.5],
  ["ink", "warning-soft", 4.5],
  ["ink", "danger-soft", 4.5],
  ["ink", "info-soft", 4.5],
  ["ink", "gold-soft", 4.5],
  ["fairway", "fairway-soft", 4.5],
  ["gold-ink", "gold-soft", 4.5],
  ["success", "success-soft", 4.5],
  ["warning", "warning-soft", 4.5],
  ["danger", "danger-soft", 4.5],
  ["info", "info-soft", 4.5],
  ["on-forest", "forest", 4.5],
  ["on-forest-muted", "forest", 4.5],
  ["gold", "forest", 3],
  ["on-gold", "gold", 4.5],
  ["on-primary", "primary", 4.5],
  ["on-primary", "primary-hover", 4.5],
  ["on-danger", "danger", 4.5],
];

const themes = {
  light: tokens(":root"),
  dark: tokens(':root[data-theme="dark"]'),
};

describe.each(Object.entries(themes))("%s theme contrast", (_name, t) => {
  it.each(PAIRS)("%s on %s is at least %s:1", (fg, bg, min) => {
    const a = t[fg];
    const b = t[bg];
    if (!a || !b) throw new Error(`Missing token ${fg} or ${bg}`);
    expect(ratio(a, b)).toBeGreaterThanOrEqual(min);
  });
});

describe("dark theme", () => {
  it("is identical for the device setting and the manual switch", () => {
    const manual = themes.dark;
    const mq = css.indexOf("@media (prefers-color-scheme: dark)");
    const auto: Record<string, string> = {};
    const block = css.slice(mq, css.indexOf('}\n}\n:root[data-theme="dark"]', mq));
    for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      auto[m[1] as string] = m[2] as string;
    }
    expect(auto).toEqual(manual);
  });
});

describe("control room", () => {
  it("forces exactly the dark theme's values", () => {
    expect(tokens(':root:not([data-theme="light"]) .scheme-dark')).toEqual(themes.dark);
  });
});
