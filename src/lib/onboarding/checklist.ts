import type { TranslationKey } from "@/lib/i18n/t";

export const CHECKLIST_STORAGE_KEY = "teeline-onboarding-checklist-v1";

/** One thing to try before the first tee. */
export interface ChecklistItem {
  id: string;
  key: TranslationKey;
}

/** The four first-day checks, in the order the desk should do them. */
export const CHECKLIST_ITEMS: readonly ChecklistItem[] = [
  { id: "confirm-day", key: "onboard.staff.checklist.confirmDay" },
  { id: "test-arrival", key: "onboard.staff.checklist.testArrival" },
  { id: "open-schedule", key: "onboard.staff.checklist.openSchedule" },
  { id: "test-score", key: "onboard.staff.checklist.testScore" },
];

/** Ticks for one person, keyed by checklist item id. */
export type ChecklistState = Record<string, boolean>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the stored checklist per scope, skipping anything that is not a boolean tick. */
export function parseChecklistStore(
  raw: string | null | undefined,
): Record<string, ChecklistState> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};

  const store: Record<string, ChecklistState> = {};
  for (const [scope, value] of Object.entries(parsed)) {
    if (!scope || !isRecord(value)) continue;
    const state: ChecklistState = {};
    for (const [id, done] of Object.entries(value)) {
      if (id && typeof done === "boolean") state[id] = done;
    }
    store[scope] = state;
  }
  return store;
}

/** One person's ticks, empty when they have never opened the checklist. */
export function checklistFor(store: Record<string, ChecklistState>, scope: string): ChecklistState {
  return store[scope] ?? {};
}

/** Flips one item, or sets it to the given value. Returns a new state. */
export function toggleChecklist(state: ChecklistState, id: string, done?: boolean): ChecklistState {
  const next = done ?? state[id] !== true;
  return { ...state, [id]: next };
}

/** How many known items are ticked. Unknown ids never inflate the count. */
export function checklistDone(state: ChecklistState): number {
  return CHECKLIST_ITEMS.filter((item) => state[item.id] === true).length;
}

/** The number of items in the checklist. */
export function checklistTotal(): number {
  return CHECKLIST_ITEMS.length;
}

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
  } catch {
    // Storage can be switched off; the checklist then simply starts empty.
    return null;
  }
}

function writeRaw(value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHECKLIST_STORAGE_KEY, value);
  } catch {
    // Same as above: the ticks stay for this visit only.
  }
}

/** This browser's checklist for a scope. */
export function readChecklist(scope: string): ChecklistState {
  return checklistFor(parseChecklistStore(readRaw()), scope);
}

/** Writes one scope's checklist and leaves the rest of the store alone. */
export function writeChecklist(scope: string, state: ChecklistState): void {
  const store = parseChecklistStore(readRaw());
  writeRaw(JSON.stringify({ ...store, [scope]: state }));
}
