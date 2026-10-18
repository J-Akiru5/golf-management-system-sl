import { describe, expect, it } from "vitest";
import { getDictionary } from "./dictionaries";
import { type Dictionary, en } from "./dictionaries/en";
import { hil } from "./dictionaries/hil";
import { tl } from "./dictionaries/tl";
import { isLocale, LOCALES, localeFromAcceptLanguage, resolveLocale } from "./locales";
import { interpolate, makeTranslator, type TranslationKey } from "./t";

describe("locales", () => {
  it("knows its three locales and nothing else", () => {
    expect(LOCALES).toEqual(["en", "tl", "hil"]);
    expect(isLocale("tl")).toBe(true);
    expect(isLocale("fil")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("reads the browser's preference, treating fil and tl as Tagalog", () => {
    expect(localeFromAcceptLanguage("en-PH,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("fil-PH,fil;q=0.9,en;q=0.8")).toBe("tl");
    expect(localeFromAcceptLanguage("tl;q=0.9,en;q=0.8")).toBe("tl");
    expect(localeFromAcceptLanguage("hil-PH")).toBe("hil");
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9")).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });

  it("prefers the saved choice over the browser's", () => {
    expect(resolveLocale("hil", "en-PH")).toBe("hil");
    expect(resolveLocale("nonsense", "hil")).toBe("hil");
    expect(resolveLocale(null, "de")).toBe("en");
    expect(resolveLocale(undefined, undefined)).toBe("en");
  });
});

describe("translator", () => {
  it("interpolates placeholders and keeps unknown ones visible", () => {
    expect(interpolate("Hole {hole}{wave}", { hole: 10, wave: "A" })).toBe("Hole 10A");
    expect(interpolate("Hole {hole}", { hole: 10 })).toBe("Hole 10");
    expect(interpolate("Version {version} · {when}", { version: 4 })).toBe("Version 4 · {when}");
  });

  it("falls back to English and then to the key, never to a blank line", () => {
    // A dictionary that lost a key (a bad merge, a hand-edited file) still renders English.
    expect(makeTranslator({} as Dictionary)("player.title")).toBe("My golf");
    // A key that exists nowhere comes back as the key itself, which is visible in review.
    expect(makeTranslator(en)("player.nope" as TranslationKey)).toBe("player.nope");
    expect(makeTranslator(tl)("player.title")).toBe("Ang golf ko");
  });
});

describe("dictionaries", () => {
  const flatten = (value: unknown, prefix = ""): [string, string][] => {
    if (typeof value === "string") return [[prefix, value]];
    if (typeof value !== "object" || value === null) return [];
    return Object.entries(value).flatMap(([key, child]) =>
      flatten(child, prefix === "" ? key : `${prefix}.${key}`),
    );
  };

  const english = new Map(flatten(en));

  it("has the same keys in every locale", () => {
    for (const [name, dict] of [
      ["tl", tl],
      ["hil", hil],
    ] as const) {
      const translated = new Map(flatten(dict));
      const missing = [...english.keys()].filter((key) => !translated.has(key));
      const extra = [...translated.keys()].filter((key) => !english.has(key));
      expect(missing, `${name} is missing keys`).toEqual([]);
      expect(extra, `${name} has keys English does not`).toEqual([]);
    }
  });

  it("has no empty strings", () => {
    for (const locale of LOCALES) {
      const dict = getDictionary(locale);
      const empty = [...new Map(flatten(dict)).entries()]
        .filter(([, text]) => text.trim() === "")
        .map(([key]) => key);
      expect(empty, `${locale} has empty strings`).toEqual([]);
    }
  });

  it("keeps the same placeholders in every locale", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [name, dict] of [
      ["tl", tl],
      ["hil", hil],
    ] as const) {
      const translated = new Map(flatten(dict));
      for (const [key, text] of english) {
        expect(placeholders(translated.get(key) ?? ""), `${name} ${key}`).toEqual(
          placeholders(text),
        );
      }
    }
  });
});
