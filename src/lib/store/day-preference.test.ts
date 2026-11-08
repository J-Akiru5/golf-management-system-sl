import { describe, expect, it } from "vitest";
import {
  clearDayPreference,
  DAY_PREFERENCE_KEY,
  dayExists,
  dayOnEventSwitch,
  type DayNumberLike,
  readDayPreference,
  type StorageLike,
  writeDayPreference,
} from "./day-preference";

/** A Storage stand-in, so no test needs a window. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike & {
  values: Record<string, string>;
} {
  const values: Record<string, string> = { ...seed };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
    removeItem: (key) => {
      delete values[key];
    },
  };
}

const stored = (dayNumber: unknown, tournamentId: unknown = "event-1"): Record<string, string> => ({
  [DAY_PREFERENCE_KEY]: JSON.stringify({ tournamentId, dayNumber }),
});

describe("remembered playing day", () => {
  it("round trips the event and the day", () => {
    const storage = memoryStorage();
    writeDayPreference(storage, "event-1", 3);
    expect(readDayPreference(storage)).toEqual({ tournamentId: "event-1", dayNumber: 3 });
  });

  it("remembers a day chosen before an event was known", () => {
    const storage = memoryStorage();
    writeDayPreference(storage, null, 2);
    expect(readDayPreference(storage)).toEqual({ tournamentId: null, dayNumber: 2 });
  });

  it("has nothing remembered in a fresh browser", () => {
    expect(readDayPreference(memoryStorage())).toBeNull();
    expect(readDayPreference(null)).toBeNull();
  });

  it("treats bad JSON as nothing remembered", () => {
    expect(readDayPreference(memoryStorage({ [DAY_PREFERENCE_KEY]: "{not json" }))).toBeNull();
    expect(readDayPreference(memoryStorage({ [DAY_PREFERENCE_KEY]: "[1,2]" }))).toBeNull();
    expect(readDayPreference(memoryStorage({ [DAY_PREFERENCE_KEY]: "null" }))).toBeNull();
  });

  it("refuses a stored day that is not a whole number above zero", () => {
    for (const dayNumber of [0, -1, 1.5, "2", null]) {
      expect(readDayPreference(memoryStorage(stored(dayNumber)))).toBeNull();
    }
  });

  it("refuses a stored event id that is neither a string nor null", () => {
    expect(readDayPreference(memoryStorage(stored(2, 7)))).toBeNull();
    expect(
      readDayPreference(memoryStorage({ [DAY_PREFERENCE_KEY]: JSON.stringify({ dayNumber: 2 }) })),
    ).toBeNull();
  });

  it("never writes a day that is not a whole number above zero", () => {
    const storage = memoryStorage(stored(2));
    writeDayPreference(storage, "event-2", 0);
    writeDayPreference(storage, "event-2", -3);
    writeDayPreference(storage, "event-2", 1.5);
    writeDayPreference(storage, "event-2", Number.NaN);
    expect(readDayPreference(storage)).toEqual({ tournamentId: "event-1", dayNumber: 2 });
  });

  it("clears the remembered day", () => {
    const storage = memoryStorage();
    writeDayPreference(storage, "event-1", 2);
    clearDayPreference(storage);
    expect(readDayPreference(storage)).toBeNull();
  });

  it("does not throw when the browser refuses storage", () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error("storage is blocked");
      },
      setItem: () => {
        throw new Error("storage is blocked");
      },
      removeItem: () => {
        throw new Error("storage is blocked");
      },
    };
    expect(readDayPreference(blocked)).toBeNull();
    expect(() => writeDayPreference(blocked, "event-1", 2)).not.toThrow();
    expect(() => clearDayPreference(blocked)).not.toThrow();
    expect(() => writeDayPreference(null, "event-1", 2)).not.toThrow();
  });
});

describe("a day across an event switch", () => {
  const threeDays: DayNumberLike[] = [
    { dayNumber: 1, isPlayingDay: true },
    { dayNumber: 2, isPlayingDay: true },
    { dayNumber: 3, isPlayingDay: true },
  ];

  it("keeps the day when the new event plays it", () => {
    expect(dayOnEventSwitch(2, threeDays)).toBe(2);
    expect(dayExists(threeDays, 2)).toBe(true);
  });

  it("takes the first playing day when the new event does not play that day", () => {
    expect(dayOnEventSwitch(4, threeDays)).toBe(1);
    expect(dayExists(threeDays, 4)).toBe(false);
  });

  it("skips a day the event does not play", () => {
    const withRestDay: DayNumberLike[] = [
      { dayNumber: 1, isPlayingDay: false },
      { dayNumber: 2, isPlayingDay: true },
    ];
    expect(dayExists(withRestDay, 1)).toBe(false);
    expect(dayOnEventSwitch(1, withRestDay)).toBe(2);
    expect(dayOnEventSwitch(9, withRestDay)).toBe(2);
  });

  it("has no day when the event has no days", () => {
    expect(dayOnEventSwitch(2, [])).toBeNull();
    expect(dayOnEventSwitch(null, [])).toBeNull();
    expect(dayExists([], 2)).toBe(false);
    expect(dayExists(threeDays, null)).toBe(false);
  });

  it("takes the first day in day order, whatever order the days arrive in", () => {
    const unordered: DayNumberLike[] = [
      { dayNumber: 3, isPlayingDay: true },
      { dayNumber: 1, isPlayingDay: true },
      { dayNumber: 2, isPlayingDay: true },
    ];
    expect(dayOnEventSwitch(null, unordered)).toBe(1);
  });
});
