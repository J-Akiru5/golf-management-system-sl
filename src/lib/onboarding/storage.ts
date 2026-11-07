import type { OnboardingRole } from "./types";

export const ONBOARDING_STORAGE_KEY = "teeline-onboarding-v1";

/** The checklist wrappers live with the checklist; storage re-exports them for one import path. */
export { CHECKLIST_STORAGE_KEY, readChecklist, writeChecklist } from "./checklist";

/** Where one person is in the welcome. */
export interface OnboardingProgress {
  seen: boolean;
  step: number;
  updatedAt: string | null;
}

/** A person's key: the role alone, or the role and their user id. */
export function scopeKey(role: OnboardingRole, userId?: string): string {
  return userId ? `${role}:${userId}` : role;
}

function defaultProgress(): OnboardingProgress {
  return { seen: false, step: 0, updatedAt: null };
}

function cleanStep(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the progress store, tolerating anything. Junk JSON is an empty store, a scope that is not
 * an object is skipped, and missing fields get their defaults.
 */
export function parseProgressStore(
  raw: string | null | undefined,
): Record<string, OnboardingProgress> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};

  const store: Record<string, OnboardingProgress> = {};
  for (const [scope, value] of Object.entries(parsed)) {
    if (!scope || !isRecord(value)) continue;
    store[scope] = {
      seen: value.seen === true,
      step: cleanStep(value.step),
      updatedAt:
        typeof value.updatedAt === "string" && value.updatedAt !== "" ? value.updatedAt : null,
    };
  }
  return store;
}

/** One person's progress, with defaults when they have never started. */
export function progressFor(
  store: Record<string, OnboardingProgress>,
  role: OnboardingRole,
  userId?: string,
): OnboardingProgress {
  return store[scopeKey(role, userId)] ?? defaultProgress();
}

/** Merges a change into one scope and stamps the time. Other scopes are kept as they are. */
export function withProgress(
  store: Record<string, OnboardingProgress>,
  role: OnboardingRole,
  userId: string | undefined,
  patch: Partial<Pick<OnboardingProgress, "seen" | "step">>,
): Record<string, OnboardingProgress> {
  const key = scopeKey(role, userId);
  const current = store[key] ?? defaultProgress();
  return {
    ...store,
    [key]: {
      seen: patch.seen ?? current.seen,
      step: patch.step === undefined ? current.step : cleanStep(patch.step),
      updatedAt: new Date().toISOString(),
    },
  };
}

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // A browser with storage switched off still gets the welcome; it just asks again next time.
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Same as above: the welcome shows again rather than breaking the page.
  }
}

/** This browser's progress for a person. */
export function readProgress(role: OnboardingRole, userId?: string): OnboardingProgress {
  return progressFor(parseProgressStore(readRaw(ONBOARDING_STORAGE_KEY)), role, userId);
}

/** Writes one person's progress and leaves every other scope untouched. */
export function saveProgress(
  role: OnboardingRole,
  userId: string | undefined,
  progress: OnboardingProgress,
): void {
  const store = parseProgressStore(readRaw(ONBOARDING_STORAGE_KEY));
  const next = withProgress(store, role, userId, { seen: progress.seen, step: progress.step });
  writeRaw(ONBOARDING_STORAGE_KEY, JSON.stringify(next));
}

/** Clears one scope's progress but keeps every other person's ticks and step. */
export function resetProgress(role: OnboardingRole, userId?: string): void {
  const store = parseProgressStore(readRaw(ONBOARDING_STORAGE_KEY));
  const next = { ...store, [scopeKey(role, userId)]: defaultProgress() };
  writeRaw(ONBOARDING_STORAGE_KEY, JSON.stringify(next));
}
