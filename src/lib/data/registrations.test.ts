import { describe, expect, it } from "vitest";
import type { CategoryRule, FlightRule, Tee } from "@/lib/routing";
import { overrideTee, partnerOf, registrationFor } from "./registrations";
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
    // The desk's stored class is the pair's class, so applyTeamClasses can give it to both partners.
    expect(reg.classSource).toBe("stored");
    expect(reg.reasons).toEqual([
      "Gender is still missing; the category was chosen by the organizer.",
    ]);
  });

  it("draws a player with no birthdate or gender on the club's open division", () => {
    const reg = registrationFor({
      tournament,
      tees,
      player: player({ birthdate: null, gender: null }),
      entry: entry({ status: "ok" }),
      records: [],
    });

    expect(reg.status).toBe("ok");
    expect(reg.provisional).toBe(false);
    expect(reg.categoryId).toBe("regular");
    expect(reg.teeId).toBe("white");
    expect(reg.flightId).toBe("r-a");
    expect(reg.playingHandicap).not.toBeNull();
    expect(reg.ageKnown).toBe(false);
    // The facts are still listed so the desk can collect them before scoring.
    expect(reg.missing).toEqual(["birthdate", "gender"]);
    expect(reg.reasons.join(" ")).toContain("No birthdate or gender on file; Regular is used");
  });

  it("classifies a confirmed entry without a handicap index at 0 instead of parking it", () => {
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
    expect(reg.provisional).toBe(false);
    expect(reg.missing).toEqual([]);
    expect(reg.flightId).toBe("r-a");
    expect(reg.playingHandicap).toBe(0);
    expect(reg.reasons.join(" ")).toContain("No NGAP record on or before the cut-off");
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

  it("keeps an override placeable when the age and class never arrived", () => {
    const reg = registrationFor({
      tournament,
      tees,
      player: player({ birthdate: null, gender: null }),
      entry: entry({
        status: "ok",
        frozen: {
          index: null,
          recordId: null,
          effectiveDate: null,
          frozenAt: "2026-11-01T00:00:00.000Z",
        },
        categoryId: null,
        teeId: null,
        flightId: null,
        playingHandicap: null,
        overridden: true,
        overrideReason: "Guest did not send their details.",
      }),
      records: [],
    });

    expect(reg.status).toBe("ok");
    expect(reg.provisional).toBe(true);
    expect(reg.missing).toEqual(["birthdate", "gender", "category", "flight"]);
    expect(reg.categoryId).toBeNull();
    expect(reg.flightId).toBeNull();
    expect(reg.ageKnown).toBe(false);
  });

  it("places an override that names a category and a flight by those facts", () => {
    const reg = registrationFor({
      tournament,
      tees,
      player: player({ birthdate: null }),
      entry: entry({
        status: "ok",
        categoryId: "regular",
        teeId: "white",
        flightId: "r-a",
        playingHandicap: 12,
        overridden: true,
      }),
      records: [],
    });

    expect(reg.status).toBe("ok");
    expect(reg.provisional).toBe(false);
    expect(reg.flightId).toBe("r-a");
    expect(reg.playingHandicap).toBe(12);
  });
});

describe("partnerOf", () => {
  it("finds the other entry with the same pair number", () => {
    const member = entry({ id: "member", teamNo: 4 });
    const guest = entry({ id: "guest", teamNo: 4, playerId: "player-2" });
    const solo = entry({ id: "solo", teamNo: null, playerId: "player-3" });

    expect(partnerOf(member, [member, guest, solo])?.id).toBe("guest");
    expect(partnerOf(guest, [member, guest, solo])?.id).toBe("member");
  });

  it("returns nothing for a player without a pair", () => {
    const solo = entry({ teamNo: null });
    const other = entry({ id: "other", teamNo: 7, playerId: "player-2" });

    expect(partnerOf(solo, [solo, other])).toBeNull();
  });

  it("returns nothing when neither entry has a pair number", () => {
    const a = entry({ id: "a", teamNo: undefined });
    const b = entry({ id: "b", teamNo: undefined, playerId: "player-2" });

    expect(partnerOf(a, [a, b])).toBeNull();
  });
});

describe("overrideTee", () => {
  const blue: Tee = { id: "blue", name: "Blue", courseRating: 70.1, slope: 124, par: 72 };
  const eventTees = [blue, ...tees];

  it("uses the registration's own tee rather than the category tee", () => {
    const chosen = overrideTee(
      { entryTeeId: "blue", registrationTeeId: "blue", categoryTeeId: "white" },
      eventTees,
    );

    expect(chosen?.name).toBe("Blue");
  });

  it("uses the routing view's tee when the entry row carries none", () => {
    expect(
      overrideTee({ registrationTeeId: "white", categoryTeeId: "blue" }, eventTees)?.name,
    ).toBe("White");
  });

  it("falls back to the category tee only when the registration has no tee", () => {
    expect(overrideTee({ categoryTeeId: "blue" }, eventTees)?.name).toBe("Blue");
    expect(
      overrideTee({ entryTeeId: null, registrationTeeId: null, categoryTeeId: "white" }, eventTees)
        ?.name,
    ).toBe("White");
  });

  it("never swaps an unknown tee for a different one", () => {
    expect(overrideTee({ entryTeeId: "ladies", categoryTeeId: "blue" }, eventTees)).toBeNull();
  });

  it("answers nothing when there is no tee at all", () => {
    expect(overrideTee({}, eventTees)).toBeNull();
  });
});
