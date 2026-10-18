import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { LOCALES } from "@/lib/i18n/locales";
import { makeTranslator } from "@/lib/i18n/t";
import {
  allGuides,
  DESK_GUIDES,
  deskGuidesFor,
  helpAnchors,
  PLAYER_GUIDES,
  playerGuidesFor,
  welcomeFor,
} from "./guides";
import { type HelpText, helpText } from "./types";

/**
 * Chrome anchors are not guide targets: the help button, its panel and the welcome panel carry
 * `data-help` so the browser script can find them, and no step points at them.
 */
const CHROME_ANCHORS = new Set(["help-button", "help-sheet", "help-welcome"]);

const SOURCE_ROOT = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
      return sourceFiles(join(dir, entry.name));
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [join(dir, entry.name)] : [];
  });
}

/** Every `data-help="…"` written anywhere in the source. */
function anchorsInSource(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/data-help="([a-z0-9-]+)"/g)) {
      const anchor = match[1];
      if (!anchor) continue;
      found.set(anchor, [...(found.get(anchor) ?? []), file.replace(SOURCE_ROOT, "src")]);
    }
  }
  return found;
}

const resolveEveryText = (texts: HelpText[], locale: (typeof LOCALES)[number]): string[] => {
  const t = makeTranslator(getDictionary(locale));
  return texts.map((text) => {
    const value = helpText(text, t);
    if (text.kind === "key" && value === text.key) {
      throw new Error(`${locale}: "${text.key}" has no translation`);
    }
    return value;
  });
};

describe("guides", () => {
  it("gives every guide an id, a title and at least one step", () => {
    for (const guide of allGuides()) {
      expect(guide.id, "a guide has no id").toBeTruthy();
      expect(guide.steps.length, `${guide.id} has no steps`).toBeGreaterThan(0);
      expect(helpText(guide.title, makeTranslator(getDictionary("en")))).toBeTruthy();
    }
  });

  it("keeps ids unique", () => {
    const ids = allGuides().map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("print copy in the reader's language, never a bare key", () => {
    for (const locale of LOCALES) {
      for (const guide of PLAYER_GUIDES) {
        resolveEveryText(
          [
            guide.title,
            ...(guide.summary ? [guide.summary] : []),
            ...guide.steps.map((s) => s.text),
          ],
          locale,
        );
      }
      const welcome = welcomeFor("player");
      resolveEveryText([welcome.title, welcome.body, welcome.button, ...welcome.bullets], locale);
    }
  });

  it("points every anchor at a control that exists in the source", () => {
    const inSource = anchorsInSource();
    for (const anchor of helpAnchors()) {
      expect(inSource.has(anchor), `no data-help="${anchor}" anywhere in src`).toBe(true);
    }
  });

  it("leaves no data-help attribute that no guide explains", () => {
    const guideAnchors = new Set(helpAnchors());
    for (const [anchor, files] of anchorsInSource()) {
      if (CHROME_ANCHORS.has(anchor)) continue;
      expect(
        guideAnchors.has(anchor),
        `data-help="${anchor}" in ${files.join(", ")} is in no guide`,
      ).toBe(true);
    }
  });

  it("uses anchor-shaped names only, because they reach a CSS selector", () => {
    for (const anchor of helpAnchors()) {
      expect(anchor).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });
});

describe("which guide a screen shows", () => {
  it("puts the desk guide for the current route first, and keeps the rest", () => {
    const players = deskGuidesFor("/players");
    expect(players[0]?.id).toBe("desk.players");
    expect(players).toHaveLength(DESK_GUIDES.length);

    // A record under the route counts as being on it.
    expect(deskGuidesFor("/players/p-123")[0]?.id).toBe("desk.players");

    // An unknown screen still gets every guide; nothing is a dead end.
    const unknown = deskGuidesFor("/spotlight");
    expect(unknown).toHaveLength(DESK_GUIDES.length);
    expect(unknown[0]?.id).not.toBe("desk.players");
  });

  it("puts the player guide for the current screen first", () => {
    expect(playerGuidesFor("my")[0]?.id).toBe("player.my");
    expect(playerGuidesFor("pairings")[0]?.id).toBe("player.pairings");
    expect(playerGuidesFor("my")).toHaveLength(PLAYER_GUIDES.length);
  });

  it("has one welcome per audience", () => {
    expect(welcomeFor("desk").id).toBe("welcome.desk");
    expect(welcomeFor("player").id).toBe("welcome.player");
    expect(welcomeFor("desk").bullets.length).toBeGreaterThan(1);
  });
});
