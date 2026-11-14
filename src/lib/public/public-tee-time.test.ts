import { describe, expect, it } from "vitest";
import { publicTeeTime } from "./public-tee-time";

describe("publicTeeTime", () => {
  it("prints the morning session the club named for every playing day", () => {
    expect(publicTeeTime({ dayNumber: 1, afternoon: false })).toBe("06:30");
    expect(publicTeeTime({ dayNumber: 2, afternoon: false })).toBe("06:30");
    expect(publicTeeTime({ dayNumber: 3, afternoon: false })).toBe("06:00");
    expect(publicTeeTime({ dayNumber: 4, afternoon: false })).toBe("06:00");
  });

  it("prints the afternoon session, earlier on Sunday", () => {
    expect(publicTeeTime({ dayNumber: 1, afternoon: true })).toBe("12:30");
    expect(publicTeeTime({ dayNumber: 2, afternoon: true })).toBe("12:30");
    expect(publicTeeTime({ dayNumber: 3, afternoon: true })).toBe("12:00");
    expect(publicTeeTime({ dayNumber: 4, afternoon: true })).toBe("11:30");
  });

  it("gives both flights the same time, because the session is what is shown", () => {
    const morning = publicTeeTime({ dayNumber: 1, afternoon: false });
    const afternoon = publicTeeTime({ dayNumber: 1, afternoon: true });
    expect([morning, morning]).toEqual(["06:30", "06:30"]);
    expect([afternoon, afternoon]).toEqual(["12:30", "12:30"]);
  });

  it("never shows a wave offset", () => {
    const shown = [1, 2, 3, 4].flatMap((dayNumber) =>
      [false, true].map((afternoon) => publicTeeTime({ dayNumber, afternoon })),
    );
    expect(shown).not.toContain("06:12");
    expect(shown).not.toContain("12:42");
  });

  it("returns null for a day the club's rule does not name, rather than guessing", () => {
    for (const dayNumber of [0, 5, -1]) {
      expect(publicTeeTime({ dayNumber, afternoon: false })).toBeNull();
      expect(publicTeeTime({ dayNumber, afternoon: true })).toBeNull();
    }
    expect(publicTeeTime({ dayNumber: 2.5, afternoon: false })).toBeNull();
    expect(publicTeeTime({ dayNumber: Number.NaN, afternoon: true })).toBeNull();
  });
});
