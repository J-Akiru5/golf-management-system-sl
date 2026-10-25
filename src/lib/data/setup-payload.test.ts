import { describe, expect, it } from "vitest";
import type { Tee } from "@/lib/routing";
import { setupPayload } from "./setup-payload";
import type { Hole, Tournament } from "./types";

const tees: Tee[] = [
  { id: "tee-white", name: "White", courseRating: 71.5, slope: 128, par: 72 },
  { id: "tee-silver", name: "Silver", courseRating: 68.2, slope: 118, par: 72 },
];

const holes: Hole[] = [
  { id: "h1", courseId: "course", number: 1, par: 4, strokeIndex: 7 },
  { id: "h2", courseId: "course", number: 2, par: null, strokeIndex: null },
];

const tournament: Tournament = {
  id: "tournament",
  clubId: "club",
  name: "24th Bamboo Tee",
  nameNeedsConfirmation: false,
  courseId: "course",
  // Nobody has checked these numbers against the club scorecard yet, which is the normal state.
  courseDataConfirmed: false,
  dates: ["2026-11-12", "2026-11-13"],
  cutOffDate: "2026-11-01",
  scheduleNeedsConfirmation: true,
  config: {
    date: "2026-11-12",
    maxIndex: 30,
    allowance: 1,
    flightBasis: "courseHandicap",
    startFormat: "shotgun",
    holes: 18,
    groupSize: 4,
    minGroupSize: 3,
    firstTeeTime: "06:30",
    intervalMinutes: 12,
    waveGapMinutes: 360,
  },
  categories: [
    { id: "cat-1", name: "Regular", gender: "M", minAge: 0, maxAge: null, teeId: "tee-white" },
  ],
  flights: [{ id: "flt-1", categoryId: "cat-1", name: "Low", min: 0, max: 15 }],
  registration: {
    responseEmail: "iloilogolf@yahoo.com",
    sponsorQuestion: "Are you a sponsor?",
    payment: null,
    teeTimes: [],
    shirtSizes: ["M", "L"],
    fields: [],
    instructions: "Four days of competition.",
  },
  staleIndexDays: 120,
  state: "open",
  createdAt: "2026-10-18T00:00:00.000Z",
};

describe("setupPayload", () => {
  it("fills every parameter for a save-all", () => {
    const payload = setupPayload(tournament, tees, holes, "all");
    expect(payload.p_basics).toEqual({
      name: "24th Bamboo Tee",
      dates: ["2026-11-12", "2026-11-13"],
      state: "open",
      nameNeedsConfirmation: false,
      rulesOfPlay: "",
    });
    expect(payload.p_rules?.cutoffDate).toBe("2026-11-01");
    expect(payload.p_rules?.flightBasis).toBe("course_handicap");
    expect(payload.p_start?.firstTeeTime).toBe("06:30");
    expect(payload.p_course).toEqual({ holes: 18 });
    expect(payload.p_tees).toHaveLength(2);
    expect(payload.p_categories?.[0]?.teeName).toBe("White");
    expect(payload.p_flights?.[0]?.categoryName).toBe("Regular");
    expect(payload.p_registration).toBe(tournament.registration);
  });

  it("sends only the section asked for", () => {
    const payload = setupPayload(tournament, tees, holes, ["basics"]);
    expect(payload.p_basics).not.toBeNull();
    expect(payload.p_rules).toBeNull();
    expect(payload.p_start).toBeNull();
    expect(payload.p_registration).toBeNull();
    expect(payload.p_course).toBeNull();
    expect(payload.p_holes).toBeNull();
    expect(payload.p_tees).toBeNull();
    expect(payload.p_categories).toBeNull();
    expect(payload.p_flights).toBeNull();
  });

  it("carries the rules of play with the playbook section, and only with it", () => {
    const withRules = { ...tournament, rulesOfPlay: "Play the ball as it lies." };
    const playbook = setupPayload(withRules, tees, holes, ["playbook"]);
    expect(playbook.p_basics?.rulesOfPlay).toBe("Play the ball as it lies.");
    expect(playbook.p_rules).toBeNull();
    expect(playbook.p_start).toBeNull();

    const start = setupPayload(withRules, tees, holes, ["start"]);
    expect(start.p_basics).toBeNull();
  });

  it("carries the hole count with Start, because that is where config.holes is stored", () => {
    const payload = setupPayload(tournament, tees, holes, ["start"]);
    expect(payload.p_course).toEqual({ holes: 18 });
    expect(payload.p_start?.startFormat).toBe("shotgun");
    expect(payload.p_holes).toBeNull();
    expect(payload.p_tees).toBeNull();
  });

  it("leaves the stored hole card alone when the card on screen is incomplete", () => {
    // The fixture has two holes, one of them blank. It used to be written with par 4 and the hole's
    // own number as its stroke index: numbers nobody had entered, recorded as if they had. A card
    // now goes only as a whole, valid card, so an unfinished one sends null and the stored card is
    // left as it was.
    const payload = setupPayload(tournament, tees, holes, ["course"]);
    expect(payload.p_holes).toBeNull();
    expect(payload.p_tees).toHaveLength(2);
  });

  it("writes a hole card once all 18 holes carry a par and a stroke index", () => {
    const card: Hole[] = Array.from({ length: 18 }, (_, i) => ({
      id: `h${i + 1}`,
      courseId: "course",
      number: i + 1,
      par: 4,
      strokeIndex: 18 - i,
    }));
    const payload = setupPayload(tournament, tees, card, ["course"]);
    expect(payload.p_holes).toHaveLength(18);
    expect(payload.p_holes?.[0]).toEqual({ number: 1, par: 4, strokeIndex: 18 });
    expect(payload.p_holes?.[17]).toEqual({ number: 18, par: 4, strokeIndex: 1 });
  });

  it("refuses a card whose stroke index repeats, even when every hole is filled in", () => {
    const card: Hole[] = Array.from({ length: 18 }, (_, i) => ({
      id: `h${i + 1}`,
      courseId: "course",
      number: i + 1,
      par: 4,
      strokeIndex: 7,
    }));
    expect(setupPayload(tournament, tees, card, ["course"]).p_holes).toBeNull();
  });

  it("refuses a par the database would reject, rather than failing the whole write", () => {
    const card: Hole[] = Array.from({ length: 18 }, (_, i) => ({
      id: `h${i + 1}`,
      courseId: "course",
      number: i + 1,
      par: 4,
      strokeIndex: i + 1,
    }));
    card[2] = { ...card[2]!, par: 7 };
    expect(setupPayload(tournament, tees, card, ["course"]).p_holes).toBeNull();
  });

  it("does not mutate the domain objects it reads", () => {
    const before = JSON.stringify(tournament);
    setupPayload(tournament, tees, holes, "all");
    expect(JSON.stringify(tournament)).toBe(before);
  });
});
