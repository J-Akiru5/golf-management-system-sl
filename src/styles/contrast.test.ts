import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

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

// [foreground, background, minimum ratio]. 4.5 for text, 3 for borders and focus rings.
const PAIRS: [string, string, number][] = [
  ["ink", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["muted", "bg", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "surface-2", 4.5],
  ["on-primary", "primary", 4.5],
  ["link", "bg", 4.5],
  ["link", "surface", 4.5],
  ["primary", "primary-soft", 4.5],
  ["on-gold", "gold", 4.5],
  ["gold-ink", "gold-soft", 4.5],
  ["ok", "ok-soft", 4.5],
  ["ok", "surface", 4.5],
  ["warn", "warn-soft", 4.5],
  ["bad", "bad-soft", 4.5],
  ["bad", "surface", 4.5],
  ["on-chrome", "chrome", 4.5],
  ["gold", "chrome", 3],
  ["focus", "bg", 3],
  ["focus", "surface", 3],
  ["gold-line", "surface", 3],
  ["line-strong", "surface", 3],
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
