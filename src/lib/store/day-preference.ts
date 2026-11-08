/**
 * The playing day the desk was last showing.
 *
 * It is a fact about this browser, not about the tournament, so it lives in `localStorage` rather
 * than the schema. It is written beside the event id, so a saved day is only reused for the event it
 * was chosen on: switching events keeps the same day when that event plays it, and opens on that
 * event's first playing day otherwise.
 *
 * Everything here takes a Storage-like object and never touches `window`, so it can be tested
 * without a browser and never throws during a server render.
 */

/** The part of the DOM Storage API these helpers need, so a test can pass a plain object. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DAY_PREFERENCE_KEY = "teelime.desk.day";

export interface DayPreference {
  /** The event the day was chosen on, or null when it was chosen before an event was known. */
  tournamentId: string | null;
  dayNumber: number;
}

/** The only fact these helpers need about a day. */
export interface DayNumberLike {
  dayNumber: number;
  isPlayingDay?: boolean;
}

/** A day number is a whole number above zero, the same rule the loader applies. */
function isDayNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** The event a saved day was chosen on is a string, or null when no event was known then. */
function isEventId(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** Reads the remembered day. Anything malformed is treated as nothing remembered, never guessed. */
export function readDayPreference(storage: StorageLike | null | undefined): DayPreference | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(DAY_PREFERENCE_KEY);
  } catch {
    // A browser with storage switched off simply remembers nothing.
    return null;
  }
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { tournamentId, dayNumber } = value as Record<string, unknown>;
    if (!isDayNumber(dayNumber) || !isEventId(tournamentId)) return null;
    return { tournamentId, dayNumber };
  } catch {
    return null;
  }
}

/** Remembers a day. A day that is not a whole number above zero is never written. */
export function writeDayPreference(
  storage: StorageLike | null | undefined,
  tournamentId: string | null,
  dayNumber: number,
): void {
  if (!storage || !isDayNumber(dayNumber)) return;
  try {
    storage.setItem(DAY_PREFERENCE_KEY, JSON.stringify({ tournamentId, dayNumber }));
  } catch {
    // A refused write costs nothing: the desk opens on the first round next time.
  }
}

export function clearDayPreference(storage: StorageLike | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(DAY_PREFERENCE_KEY);
  } catch {
    // Nothing to clear.
  }
}

const isPlayingDay = (day: DayNumberLike): boolean => day.isPlayingDay !== false;

/** True when the event plays that day number. */
export function dayExists(days: readonly DayNumberLike[], dayNumber: number | null): boolean {
  if (dayNumber === null) return false;
  return days.some((day) => isPlayingDay(day) && day.dayNumber === dayNumber);
}

/**
 * The day an event switch should show: the day already on screen when the new event plays it, and
 * otherwise that event's first playing day, in day order. Null when it has no playing day at all.
 */
export function dayOnEventSwitch(
  currentDay: number | null,
  days: readonly DayNumberLike[],
): number | null {
  if (dayExists(days, currentDay)) return currentDay;
  const first = days
    .filter(isPlayingDay)
    .map((day) => day.dayNumber)
    .sort((a, b) => a - b)[0];
  return first ?? null;
}

/**
 * The day a load of the desk should ask the database for.
 *
 * The day on screen wins. Picking a day on the Draw or Print screen works by reloading the desk for
 * that day, so the reload has to ask for the day that was just picked. The remembered day is only
 * what the browser had when the page opened; asking for it again on a later reload puts the
 * organizer back on a day they have already left (Day 1, when nothing was remembered).
 *
 * Before anything is on screen the remembered day is used, and only for the event it was chosen on
 * (or when it was saved before an event was known). Null means "no day asked for": the loader then
 * opens the event's first round.
 */
export function dayToLoad(input: {
  onScreen: number | null;
  saved: DayPreference | null;
  eventId: string | null;
}): number | null {
  if (isDayNumber(input.onScreen)) return input.onScreen;
  const { saved, eventId } = input;
  if (saved && (saved.tournamentId === null || saved.tournamentId === eventId)) {
    return saved.dayNumber;
  }
  return null;
}
