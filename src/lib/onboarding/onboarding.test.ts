import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/lib/i18n/dictionaries/en";
import { makeTranslator, type TranslationKey } from "@/lib/i18n/t";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_STORAGE_KEY,
  checklistDone,
  checklistFor,
  checklistTotal,
  clampStep,
  detectInstallPlatform,
  installHintKey,
  isFirstStep,
  isLastStep,
  nextStep,
  ONBOARDING_STORAGE_KEY,
  PLAYER_STEPS,
  parseChecklistStore,
  parseProgressStore,
  previousStep,
  progressFor,
  readChecklist,
  readProgress,
  resetProgress,
  STAFF_STEPS,
  saveProgress,
  scopeKey,
  stepAt,
  stepCount,
  stepForAnchor,
  stepsFor,
  toggleChecklist,
  withProgress,
  writeChecklist,
} from "./index";

const t = makeTranslator(en);
const resolves = (key: TranslationKey): boolean => t(key) !== key;

const memory = new Map<string, string>();

const fakeStorage = {
  getItem: (key: string): string | null => memory.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    memory.set(key, value);
  },
  removeItem: (key: string): void => {
    memory.delete(key);
  },
  clear: (): void => {
    memory.clear();
  },
};

beforeEach(() => {
  memory.clear();
  vi.stubGlobal("window", { localStorage: fakeStorage });
});

afterEach(() => {
  vi.unstubAllGlobals();
  memory.clear();
});

describe("steps", () => {
  it("has four player steps in order, with the right kinds", () => {
    expect(stepCount("player")).toBe(4);
    expect(PLAYER_STEPS.map((step) => step.id)).toEqual(["language", "find", "preview", "install"]);
    expect(PLAYER_STEPS.map((step) => step.kind)).toEqual([
      "language",
      "find",
      "preview",
      "install",
    ]);
    expect(stepAt("player", 1)?.actionKey).toBe("onboard.player.find.action");
    expect(stepAt("player", 1)?.actionHref).toBe("/my");
  });

  it("has six staff steps with the expected anchors", () => {
    expect(stepCount("staff")).toBe(6);
    expect(STAFF_STEPS.map((step) => step.id)).toEqual([
      "today",
      "players",
      "schedule",
      "score",
      "account",
      "checklist",
    ]);
    expect(stepAt("staff", 0)?.anchor).toBe("staff-day-pills");
    expect(stepAt("staff", 1)?.anchor).toBe("staff-arrive");
    expect(stepAt("staff", 2)?.anchor).toBe("staff-next-up");
    expect(stepAt("staff", 3)?.anchor).toBe("staff-score");
    expect(stepAt("staff", 4)?.anchor).toBe("staff-account");
    expect(stepAt("staff", 5)?.anchor).toBeUndefined();
    expect(stepAt("staff", 5)?.kind).toBe("checklist");
    expect(stepAt("staff", 2)?.actionHref).toBe("/staff/schedule");
    expect(stepAt("staff", 3)?.actionHref).toBe("/staff/score");
  });

  it("keeps ids unique across both roles", () => {
    const ids = [...PLAYER_STEPS, ...STAFF_STEPS].map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has title, body and action keys that resolve in English", () => {
    for (const step of [...PLAYER_STEPS, ...STAFF_STEPS]) {
      expect(resolves(step.titleKey), step.titleKey).toBe(true);
      expect(resolves(step.bodyKey), step.bodyKey).toBe(true);
      if (step.actionKey) expect(resolves(step.actionKey), step.actionKey).toBe(true);
    }
    for (const item of CHECKLIST_ITEMS) {
      expect(resolves(item.key), item.key).toBe(true);
    }
  });

  it("clamps, moves and reports the ends of the list", () => {
    expect(clampStep("player", -1)).toBe(0);
    expect(clampStep("player", 99)).toBe(3);
    expect(clampStep("staff", Number.NaN)).toBe(0);

    expect(nextStep("player", 0)).toBe(1);
    expect(nextStep("player", 3)).toBe(3);
    expect(previousStep("player", 3)).toBe(2);
    expect(previousStep("player", 0)).toBe(0);

    expect(isFirstStep("player", 0)).toBe(true);
    expect(isFirstStep("player", 1)).toBe(false);
    expect(isLastStep("staff", 5)).toBe(true);
    expect(isLastStep("staff", 99)).toBe(true);
    expect(isLastStep("staff", 4)).toBe(false);
  });

  it("returns null when the index is outside the list", () => {
    expect(stepAt("player", -1)).toBeNull();
    expect(stepAt("player", 4)).toBeNull();
    expect(stepAt("staff", 6)).toBeNull();
    expect(stepAt("staff", Number.NaN)).toBeNull();
    expect(stepsFor("player")).toBe(PLAYER_STEPS);
  });

  it("finds a step by its anchor or one of the fallbacks", () => {
    expect(stepForAnchor("staff", "staff-next-up")?.id).toBe("schedule");
    expect(stepForAnchor("staff", "staff-jump-now")?.id).toBe("schedule");
    expect(stepForAnchor("staff", "staff-arrive")?.id).toBe("players");
    expect(stepForAnchor("staff", "staff-arrivals")?.id).toBe("today");
    expect(stepForAnchor("staff", "missing")).toBeNull();
    expect(stepForAnchor("player", "staff-score")).toBeNull();
    expect(stepForAnchor("staff", "")).toBeNull();
  });
});

describe("storage", () => {
  it("treats junk as an empty store", () => {
    for (const bad of [null, undefined, "", "not json", "[]", "null", '"hello"', "42"]) {
      expect(parseProgressStore(bad), String(bad)).toEqual({});
    }
  });

  it("fills defaults for missing or wrong fields", () => {
    expect(parseProgressStore('{"player":{}}')).toEqual({
      player: { seen: false, step: 0, updatedAt: null },
    });
    expect(parseProgressStore('{"player":{"seen":"yes","step":"2"}}')).toEqual({
      player: { seen: false, step: 0, updatedAt: null },
    });
    expect(parseProgressStore('{"player":5,"staff":{"seen":true,"step":1.8}}')).toEqual({
      staff: { seen: true, step: 1, updatedAt: null },
    });
  });

  it("keeps different userIds apart", () => {
    const store = withProgress({}, "player", "a", { seen: true, step: 2 });
    expect(progressFor(store, "player", "a")).toMatchObject({ seen: true, step: 2 });
    expect(progressFor(store, "player", "b")).toEqual({
      seen: false,
      step: 0,
      updatedAt: null,
    });
  });

  it("merges one scope and leaves the others alone", () => {
    let store = withProgress({}, "player", "a", { seen: true, step: 2 });
    store = withProgress(store, "staff", "s", { seen: true, step: 1 });
    const next = withProgress(store, "player", "b", { step: 1 });

    expect(progressFor(next, "player", "a").seen).toBe(true);
    expect(progressFor(next, "staff", "s").seen).toBe(true);
    expect(progressFor(next, "player", "b").step).toBe(1);
    expect(typeof progressFor(next, "player", "b").updatedAt).toBe("string");
  });

  it("namespaces a scope by role and user", () => {
    expect(scopeKey("player")).toBe("player");
    expect(scopeKey("staff", "123")).toBe("staff:123");
    expect(ONBOARDING_STORAGE_KEY).toBe("teeline-onboarding-v1");
    expect(CHECKLIST_STORAGE_KEY).toBe("teeline-onboarding-checklist-v1");
  });

  it("writes and reads one person's progress", () => {
    saveProgress("player", "a", { seen: true, step: 3, updatedAt: null });
    expect(readProgress("player", "a")).toMatchObject({ seen: true, step: 3 });
    expect(readProgress("player", "b")).toEqual({ seen: false, step: 0, updatedAt: null });
  });

  it("resets one scope but keeps the others", () => {
    saveProgress("player", "a", { seen: true, step: 2, updatedAt: null });
    saveProgress("player", "b", { seen: true, step: 1, updatedAt: null });

    resetProgress("player", "a");

    expect(readProgress("player", "a")).toEqual({ seen: false, step: 0, updatedAt: null });
    expect(readProgress("player", "b")).toMatchObject({ seen: true, step: 1 });
  });

  it("returns defaults when there is no browser storage", () => {
    vi.unstubAllGlobals();
    expect(readProgress("player", "a")).toEqual({ seen: false, step: 0, updatedAt: null });
    expect(readChecklist("staff:1")).toEqual({});
  });
});

describe("checklist", () => {
  it("has the four first-day items", () => {
    expect(CHECKLIST_ITEMS.map((item) => item.id)).toEqual([
      "confirm-day",
      "test-arrival",
      "open-schedule",
      "test-score",
    ]);
    expect(checklistTotal()).toBe(4);
  });

  it("toggles items and counts only known ticks", () => {
    let state = toggleChecklist({}, "confirm-day");
    expect(state["confirm-day"]).toBe(true);
    expect(checklistDone(state)).toBe(1);

    state = toggleChecklist(state, "confirm-day");
    expect(state["confirm-day"]).toBe(false);
    expect(checklistDone(state)).toBe(0);

    state = toggleChecklist(state, "test-score", true);
    expect(state["test-score"]).toBe(true);
    expect(checklistDone(state)).toBe(1);
    expect(checklistDone({ "not-a-real-item": true })).toBe(0);
  });

  it("reads a stored checklist per scope", () => {
    expect(parseChecklistStore("junk")).toEqual({});
    expect(parseChecklistStore('{"staff:1":{"confirm-day":true,"x":"yes"}}')).toEqual({
      "staff:1": { "confirm-day": true },
    });
    expect(checklistFor({ "staff:1": { "test-score": true } }, "staff:1")).toEqual({
      "test-score": true,
    });
    expect(checklistFor({}, "staff:2")).toEqual({});
  });

  it("writes one scope without touching another", () => {
    writeChecklist("staff:1", { "confirm-day": true });
    writeChecklist("staff:2", { "test-score": true });

    expect(readChecklist("staff:1")).toEqual({ "confirm-day": true });
    expect(readChecklist("staff:2")).toEqual({ "test-score": true });
  });
});

describe("install", () => {
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const androidChrome =
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36";
  const macintosh =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const windows =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";

  it("detects iPhone Safari and Android Chromium", () => {
    expect(detectInstallPlatform({ userAgent: iphone })).toBe("ios-safari");
    expect(detectInstallPlatform({ userAgent: androidChrome })).toBe("android-chrome");
    expect(
      detectInstallPlatform({
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
      }),
    ).toBe("android-chrome");
  });

  it("treats an installed app as installed, whatever the user agent", () => {
    expect(detectInstallPlatform({ userAgent: iphone, standalone: true })).toBe("installed");
    expect(detectInstallPlatform({ userAgent: androidChrome, standalone: true })).toBe("installed");
  });

  it("treats a Macintosh with touch points as iPad Safari", () => {
    expect(detectInstallPlatform({ userAgent: macintosh, iPadDesktop: true })).toBe("ios-safari");
    expect(detectInstallPlatform({ userAgent: macintosh })).toBe("other");
  });

  it("falls back to other on a desktop browser", () => {
    expect(detectInstallPlatform({ userAgent: windows })).toBe("other");
    expect(detectInstallPlatform({ userAgent: "" })).toBe("other");
  });

  it("maps each platform to its dictionary line", () => {
    expect(installHintKey("installed")).toBe("onboard.player.install.installed");
    expect(installHintKey("ios-safari")).toBe("onboard.player.install.ios");
    expect(installHintKey("android-chrome")).toBe("onboard.player.install.android");
    expect(installHintKey("other")).toBe("onboard.player.install.other");
  });
});
