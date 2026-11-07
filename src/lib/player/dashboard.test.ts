import { describe, expect, it } from "vitest";
import { manilaToday, nextUp, playingDates } from "./dashboard";
import type { PortalEntry } from "./portal";

const entry = (over: Partial<PortalEntry>): PortalEntry => ({
  tournamentId: "event-1",
  eventName: "Event",
  eventDate: "2026-11-12",
  dates: ["2026-11-12"],
  startFormat: "shotgun",
  firstTeeTime: "06:30",
  state: "published",
  status: "ok",
  reasons: [],
  frozenIndex: 12.4,
  playingHandicap: 14,
  category: null,
  tee: null,
  flight: null,
  paymentStatus: "paid",
  published: true,
  start: null,
  starts: [],
  scorecards: [],
  ...over,
});

describe("manilaToday", () => {
  it("uses the club's day, not the browser's", () => {
    expect(manilaToday(new Date("2026-11-04T23:30:00Z"))).toBe("2026-11-05");
    expect(manilaToday(new Date("2026-11-04T10:00:00Z"))).toBe("2026-11-04");
  });
});

describe("playingDates", () => {
  it("sorts the playing days and falls back to the older event date", () => {
    expect(playingDates(entry({ dates: ["2026-11-14", "2026-11-12"] }))).toEqual([
      "2026-11-12",
      "2026-11-14",
    ]);
    expect(playingDates(entry({ dates: [], eventDate: "2026-11-20" }))).toEqual(["2026-11-20"]);
    expect(playingDates(entry({ dates: [], eventDate: null }))).toEqual([]);
  });
});

describe("nextUp", () => {
  it("prefers the round being played today over a later event", () => {
    const today = entry({ tournamentId: "today", dates: ["2026-11-12", "2026-11-13"] });
    const later = entry({ tournamentId: "later", dates: ["2026-12-01"] });
    expect(nextUp([later, today], "2026-11-13")).toMatchObject({
      entry: { tournamentId: "today" },
      when: "today",
      date: "2026-11-13",
    });
  });

  it("then takes the soonest future day", () => {
    const far = entry({ tournamentId: "far", dates: ["2026-12-01"] });
    const near = entry({ tournamentId: "near", dates: ["2026-11-20"] });
    expect(nextUp([far, near], "2026-11-04")).toMatchObject({
      entry: { tournamentId: "near" },
      when: "upcoming",
      date: "2026-11-20",
    });
  });

  it("falls back to the last event played, not the first", () => {
    const old = entry({ tournamentId: "old", dates: ["2026-01-10"] });
    const recent = entry({ tournamentId: "recent", dates: ["2026-10-10"] });
    expect(nextUp([old, recent], "2026-11-04")).toMatchObject({
      entry: { tournamentId: "recent" },
      when: "past",
      date: "2026-10-10",
    });
  });

  it("skips an entry with no date and answers nothing when none has one", () => {
    expect(nextUp([], "2026-11-04")).toBeNull();
    expect(nextUp([entry({ dates: [], eventDate: null })], "2026-11-04")).toBeNull();
  });
});
