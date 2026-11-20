import { describe, expect, it } from "vitest";
import type { PublicEvent } from "./highlights";
import {
  eventDayNumber,
  eventEyebrow,
  eventPhase,
  eventStatsFor,
  orderForCarousel,
  pickFeatured,
  quickActionsFor,
  toLandingEvent,
} from "./showcase";

const TODAY = "2026-11-13";

function event(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    tournamentId: "t1",
    name: "24th Bamboo Tee",
    dates: ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
    startFormat: "shotgun",
    firstTeeTime: "06:30",
    cutOffDate: "2026-11-01",
    entered: 327,
    entriesOpen: false,
    featured: false,
    ...overrides,
  };
}

describe("eventPhase", () => {
  it("is upcoming before the first day", () => {
    expect(eventPhase(event({ dates: ["2026-11-20"] }), TODAY)).toBe("upcoming");
  });

  it("is live on the first and last day", () => {
    expect(eventPhase(event(), "2026-11-12")).toBe("live");
    expect(eventPhase(event(), "2026-11-15")).toBe("live");
  });

  it("is past after the last day", () => {
    expect(eventPhase(event(), "2026-11-16")).toBe("past");
  });

  it("treats an event with no dates as upcoming rather than guessing", () => {
    expect(eventPhase(event({ dates: [] }), TODAY)).toBe("upcoming");
  });
});

describe("eventDayNumber", () => {
  it("counts the playing day from one", () => {
    expect(eventDayNumber(event(), "2026-11-12")).toBe(1);
    expect(eventDayNumber(event(), "2026-11-15")).toBe(4);
  });

  it("gives a rest day inside the week a number rather than zero", () => {
    expect(eventDayNumber(event({ dates: ["2026-11-12", "2026-11-14"] }), "2026-11-13")).toBe(2);
  });

  it("clamps a date outside the week to the first or last day", () => {
    expect(eventDayNumber(event(), "2026-11-01")).toBe(1);
    expect(eventDayNumber(event(), "2026-11-30")).toBe(4);
  });

  it("answers one for an event with no dates", () => {
    expect(eventDayNumber(event({ dates: [] }), TODAY)).toBe(1);
  });
});

describe("toLandingEvent", () => {
  it("carries the event's own facts and formats the labels", () => {
    const landing = toLandingEvent(event(), TODAY);
    expect(landing.phase).toBe("live");
    expect(landing.finished).toBe(false);
    expect(landing.dayNumber).toBe(2);
    expect(landing.dateLabel).toBe("Nov 12–15, 2026");
    expect(landing.enteredLabel).toBe("327 entered");
  });

  it("marks a finished event completed and gives it no playing day", () => {
    const landing = toLandingEvent(event(), "2026-11-20");
    expect(landing.phase).toBe("past");
    expect(landing.finished).toBe(true);
    expect(landing.dayNumber).toBe(0);
  });

  it("gives an upcoming event no playing day", () => {
    const landing = toLandingEvent(event({ dates: ["2026-11-20"] }), TODAY);
    expect(landing.phase).toBe("upcoming");
    expect(landing.finished).toBe(false);
    expect(landing.dayNumber).toBe(0);
  });

  it("uses the event's own entry count, including none", () => {
    expect(toLandingEvent(event({ entered: 0 }), TODAY).enteredLabel).toBe("No entries yet");
  });

  it("copies the organizer's feature flag without deciding it", () => {
    expect(toLandingEvent(event({ featured: true }), TODAY).featured).toBe(true);
    expect(toLandingEvent(event({ featured: false }), TODAY).featured).toBe(false);
  });
});

describe("orderForCarousel", () => {
  const live = toLandingEvent(event({ tournamentId: "live", dates: ["2026-11-13"] }), TODAY);
  const soon = toLandingEvent(event({ tournamentId: "soon", dates: ["2026-11-20"] }), TODAY);
  const later = toLandingEvent(event({ tournamentId: "later", dates: ["2026-12-01"] }), TODAY);
  const recent = toLandingEvent(event({ tournamentId: "recent", dates: ["2026-11-10"] }), TODAY);
  const older = toLandingEvent(event({ tournamentId: "older", dates: ["2026-10-01"] }), TODAY);

  it("puts live first, then upcoming by first date, then finished newest first", () => {
    const ordered = orderForCarousel([older, later, recent, soon, live]);
    expect(ordered.map((item) => item.tournamentId)).toEqual([
      "live",
      "soon",
      "later",
      "recent",
      "older",
    ]);
  });

  it("does not mutate the caller's list", () => {
    const input = [older, live];
    orderForCarousel(input);
    expect(input.map((item) => item.tournamentId)).toEqual(["older", "live"]);
  });

  it("handles an empty list", () => {
    expect(orderForCarousel([])).toEqual([]);
  });
});

describe("pickFeatured", () => {
  it("returns the event an organizer featured, whatever its phase", () => {
    const finished = toLandingEvent(
      event({ tournamentId: "finished", dates: ["2026-11-10"], featured: true }),
      TODAY,
    );
    const live = toLandingEvent(event({ tournamentId: "live", dates: ["2026-11-13"] }), TODAY);
    expect(pickFeatured([live, finished])?.tournamentId).toBe("finished");
  });

  it("does not fall back to a live or upcoming event when none is featured", () => {
    const live = toLandingEvent(event({ tournamentId: "live", dates: ["2026-11-13"] }), TODAY);
    const soon = toLandingEvent(event({ tournamentId: "soon", dates: ["2026-11-20"] }), TODAY);
    expect(pickFeatured([live, soon])).toBeNull();
  });

  it("takes the first flagged event when several carry the flag", () => {
    const first = toLandingEvent(event({ tournamentId: "first", featured: true }), TODAY);
    const second = toLandingEvent(event({ tournamentId: "second", featured: true }), TODAY);
    expect(pickFeatured([first, second])?.tournamentId).toBe("first");
  });

  it("answers null with no events", () => {
    expect(pickFeatured([])).toBeNull();
  });
});

describe("eventEyebrow", () => {
  it("names the live day", () => {
    expect(eventEyebrow(toLandingEvent(event(), TODAY), TODAY)).toBe("Live now · Day 2 of 4");
  });

  it("names the final results", () => {
    expect(eventEyebrow(toLandingEvent(event(), "2026-11-20"), "2026-11-20")).toBe("Final results");
  });

  it("names an open entry", () => {
    const upcoming = toLandingEvent(event({ dates: ["2026-11-20"], entriesOpen: true }), TODAY);
    expect(eventEyebrow(upcoming, TODAY)).toBe("Open for entry now");
  });

  it("names closed entries", () => {
    const upcoming = toLandingEvent(event({ dates: ["2026-11-20"], entriesOpen: false }), TODAY);
    expect(eventEyebrow(upcoming, TODAY)).toBe("Entries closed");
  });

  it("is empty with no featured event", () => {
    expect(eventEyebrow(null, TODAY)).toBe("");
  });
});

describe("quickActionsFor", () => {
  it("offers the scores and the pairings for a finished event", () => {
    expect(quickActionsFor(toLandingEvent(event(), "2026-11-20"))).toEqual([
      { label: "See all scores", href: "/results/all", primary: true },
      { label: "View published pairings", href: "/pairings", primary: false },
    ]);
  });

  it("offers the tee time first while the event is live", () => {
    expect(quickActionsFor(toLandingEvent(event(), TODAY))).toEqual([
      { label: "Find my tee time", href: "/pairings", primary: true },
      { label: "See all scores", href: "/results/all", primary: false },
    ]);
  });

  it("offers the pairings first for an upcoming event", () => {
    const upcoming = toLandingEvent(event({ dates: ["2026-11-20"] }), TODAY);
    expect(quickActionsFor(upcoming)).toEqual([
      { label: "View published pairings", href: "/pairings", primary: true },
      { label: "See all scores", href: "/results/all", primary: false },
    ]);
  });

  it("adds the entry action only while entries are open", () => {
    const upcoming = toLandingEvent(event({ dates: ["2026-11-20"], entriesOpen: true }), TODAY);
    expect(quickActionsFor(upcoming)).toContainEqual({
      label: "Enter",
      href: "/enter",
      primary: false,
    });
    const closed = toLandingEvent(event({ dates: ["2026-11-20"], entriesOpen: false }), TODAY);
    expect(quickActionsFor(closed).map((action) => action.href)).not.toContain("/enter");
  });

  it("has no actions with no featured event", () => {
    expect(quickActionsFor(null)).toEqual([]);
  });
});

describe("eventStatsFor", () => {
  it("shows the cut-off before the event", () => {
    const upcoming = toLandingEvent(event({ dates: ["2026-11-20"] }), TODAY);
    expect(eventStatsFor(upcoming, TODAY)).toEqual([
      { label: "Entries", value: "327" },
      { label: "Cut-off", value: "1 Nov" },
      { label: "Days", value: "1" },
      { label: "Venue", value: "Iloilo Golf and Country Club" },
    ]);
  });

  it("shows the first tee once play has started", () => {
    expect(eventStatsFor(toLandingEvent(event(), TODAY), TODAY)).toEqual([
      { label: "Entries", value: "327" },
      { label: "First tee", value: "6:30 AM" },
      { label: "Days", value: "4" },
      { label: "Venue", value: "Iloilo Golf and Country Club" },
    ]);
  });

  it("shows the first tee for a finished event too", () => {
    const stats = eventStatsFor(toLandingEvent(event(), "2026-11-20"), "2026-11-20");
    expect(stats.find((stat) => stat.label === "First tee")?.value).toBe("6:30 AM");
    expect(stats.map((stat) => stat.label)).not.toContain("Cut-off");
  });

  it("has no stats with no featured event", () => {
    expect(eventStatsFor(null, TODAY)).toEqual([]);
  });
});
