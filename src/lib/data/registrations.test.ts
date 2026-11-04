import { describe, expect, it } from "vitest";
import type { CategoryRule, FlightRule, Tee } from "@/lib/routing";
import { registrationFor } from "./registrations";
import type { PlayerRecord, RegistrationEntry, Tournament } from "./types";

const tees: Tee[] = [{ id: "white", name: "White", courseRating: 71.5, slope: 128, par: 72 }];
const categories: CategoryRule[] = [
  { id: "regular", name: "Regular", gender: "M", minAge: 0, maxAge: 59, teeId: "white" },
];
const flights: FlightRule[] = [
  { id: "r-a", categoryId: "regular", name: "Regular A", min: -10, max: 18 },
];

const tournament: Tournament = {
  id: "tournament",
  clubId: "club",
  name: "24th Bamboo Tee",
  nameNeedsConfirmation: false,
  courseId: "course",
  courseDataConfirmed: false,
  dates: ["2026-11-12"],
  cutOffDate: "2026-11-01",
  scheduleNeedsConfirmation: false,
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
  categories,
  flights,
  registration: {
    responseEmail: "entries@example.com",
    sponsorQuestion: "",
    payment: null,
    teeTimes: [],
    shirtSizes: [],
    fields: [],
    instructions: null,
  },
  staleIndexDays: 120,
  state: "open",
  createdAt: "2026-10-18T00:00:00.000Z",
};

const entry = (over: Partial<RegistrationEntry> = {}): RegistrationEntry => ({
  id: "entry-1",
  clubId: "club",
  tournamentId: "tournament",
  playerId: "player-1",
  role: "member",
  sponsor: null,
  shirt: null,
  teePreferences: {},
  declaredWshId: null,
  declaredWshHandicap: null,
  extra: {},
  paymentStatus: "pending",
  frozen: {
    index: 12.4,
    recordId: null,
    effectiveDate: "2026-11-01",
    frozenAt: "2026-11-01T00:00:00.000Z",
  },
  createdAt: "2026-10-18T00:00:00.000Z",
  source: "desk",
  ...over,
});

const player = (over: Partial<PlayerRecord> = {}): PlayerRecord => ({
  id: "player-1",
  clubId: "club",
  firstName: "Antonio",
  lastName: "Alcantara",
  nickname: null,
  name: "ANTONIO ALCANTARA",
  birthdate: "1980-05-12",
  gender: "M",
  homeCourse: "IGCC",
  contactNumber: null,
  email: null,
  ngapId: "1001",
  createdAt: "2026-10-18T00:00:00.000Z",
  ...over,
});

describe("registrationFor", () => {
  it("uses the organizer's manual routing facts for an overridden entry", () => {
    const reg = registrationFor({
      tournament,
      tees,
      player: player(),
      entry: entry({
        status: "ok",
        reasons: ["Gender is still missing; the category was chosen by the organizer."],
        categoryId: "regular",
        teeId: "white",
        flightId: "r-a",
        playingHandicap: 12,
        overridden: true,
        overrideReason: "Organizer confirmed the category.",
      }),
      records: [],
    });

    expect(reg.status).toBe("ok");
    expect(reg.categoryId).toBe("regular");
    expect(reg.teeId).toBe("white");
    expect(reg.flightId).toBe("r-a");
    expect(reg.playingHandicap).toBe(12);
    expect(reg.age).toBe(46);
    expect(reg.ageKnown).toBe(true);
    expect(reg.reasons).toEqual([
      "Gender is still missing; the category was chosen by the organizer.",
    ]);
  });

  it("keeps an entry without an override in review when the profile is incomplete", () => {
    const reg = registrationFor({
      tournament,
      tees,
      player: player({ birthdate: null }),
      entry: entry(),
      records: [],
    });

    expect(reg.status).toBe("needs_review");
    expect(reg.reasons.join(" ")).toContain("Birthdate is missing");
    expect(reg.categoryId).toBeNull();
  });

  it("marks a confirmed entry without a birthdate provisional and keeps it placeable", () => {
    const reg = registrationFor({
      tournament,
      tees,
      player: player({ birthdate: null }),
      entry: entry({ status: "ok" }),
      records: [],
    });

    expect(reg.status).toBe("ok");
    expect(reg.provisional).toBe(true);
    expect(reg.missing).toEqual(["birthdate"]);
    expect(reg.categoryId).toBeNull();
    expect(reg.flightId).toBeNull();
  });

  it("marks a confirmed entry without a handicap index provisional", () => {
    const reg = registrationFor({
      tournament,
      tees,
      player: player(),
      entry: entry({
        status: "ok",
        frozen: {
          index: null,
          recordId: null,
          effectiveDate: null,
          frozenAt: "2026-11-01T00:00:00.000Z",
        },
      }),
      records: [],
    });

    expect(reg.status).toBe("ok");
    expect(reg.provisional).toBe(true);
    expect(reg.missing).toEqual(["handicap index"]);
    expect(reg.playingHandicap).toBeNull();
  });

  it("does not mark a complete entry provisional", () => {
    const reg = registrationFor({
      tournament,
      tees,
      player: player(),
      entry: entry({ status: "ok" }),
      records: [],
    });

    expect(reg.status).toBe("ok");
    expect(reg.provisional).toBe(false);
    expect(reg.missing).toEqual([]);
    expect(reg.flightId).toBe("r-a");
  });
});
