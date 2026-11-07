import { describe, expect, it } from "vitest";
import {
  mapPublicProgramme,
  type PublishedLike,
  toPublicPairings,
  toPublicProgramme,
} from "./public";
import type { DeskRegistration, PlayerRecord, RegistrationEntry, TournamentDay } from "./types";

describe("toPublicPairings", () => {
  it("keeps only the allowed fields, however rich the source object is", () => {
    const source = {
      tournamentId: "bamboo-tee-2026",
      at: "2026-10-20T09:00:00+08:00",
      signature: "1:p1,p2",
      groups: [
        {
          number: 1,
          startHole: 1,
          time: "06:30",
          flight: "Regular A",
          players: ["Antonio Alcantara", "  Maria Santos  "],
          // Fields a richer object might carry; none may survive the projection.
          birthdate: ["1972-05-04"],
          contact: ["+63 917 000 0000"],
          photoConsent: [true],
          notes: "Organizer only",
        },
      ],
    } as unknown as PublishedLike & Record<string, unknown>;

    const out = toPublicPairings({
      published: source,
      tournamentName: "Bamboo Tee (demo)",
      dateLabel: "November 12, 2026",
      startFormat: "shotgun",
      firstTeeTime: "06:30",
    });

    expect(out.tournamentName).toBe("Bamboo Tee (demo)");
    expect(out.groups).toHaveLength(1);
    const group = out.groups[0] as NonNullable<(typeof out.groups)[number]>;
    expect(Object.keys(group).sort()).toEqual(["flight", "number", "players", "startHole", "time"]);
    // Names are trimmed and shown in capitals; nothing else about a player survives.
    expect(group.players).toEqual([
      { id: null, name: "ANTONIO ALCANTARA", photoPath: null },
      { id: null, name: "MARIA SANTOS", photoPath: null },
    ]);
    expect(JSON.stringify(out)).not.toContain("Organizer only");
    expect(JSON.stringify(out)).not.toContain("1972-05-04");
  });

  it("adds only the public photo path supplied by the allow-listed lookup", () => {
    const out = toPublicPairings({
      published: {
        groups: [
          {
            number: 1,
            startHole: 1,
            time: "06:30",
            flight: "Regular A",
            players: ["Antonio Alcantara", "Maria Santos"],
            playerIds: ["p1", "p2"],
          },
        ],
      },
      tournamentName: "Sample",
      dateLabel: "Sample",
      startFormat: "shotgun",
      firstTeeTime: "06:30",
      // p2 has no public consent, so the map has no entry for it.
      photoByPlayerId: { p1: "club/p1.jpg" },
    });

    expect(out.groups[0]?.players).toEqual([
      { id: "p1", name: "ANTONIO ALCANTARA", photoPath: "club/p1.jpg" },
      { id: "p2", name: "MARIA SANTOS", photoPath: null },
    ]);
    expect(JSON.stringify(out)).not.toContain("photo_consent_at");
  });

  it("lists two playing days apart, each with its own group 1", () => {
    const out = toPublicPairings({
      published: {
        groups: [
          {
            number: 1,
            startHole: 1,
            time: "06:30",
            flight: "Class A",
            players: ["Day One Player"],
            dayNumber: 1,
            dayLabel: "Day 1",
            playDate: "2026-11-12",
          },
          {
            number: 1,
            startHole: 10,
            time: "12:30",
            flight: "Class A",
            players: ["Day Three Player"],
            dayNumber: 3,
            dayLabel: "Day 3",
            playDate: "2026-11-14",
          },
        ],
      },
      tournamentName: "Sample",
      dateLabel: "12 to 14 November",
      startFormat: "shotgun",
      firstTeeTime: "06:30",
    });

    expect(out.groups).toHaveLength(2);
    expect(out.days?.map((day) => day.dayNumber)).toEqual([1, 3]);
    expect(out.days?.[0]?.groups).toHaveLength(1);
    expect(out.days?.[1]?.groups).toHaveLength(1);
    expect(out.days?.[1]?.groups[0]?.number).toBe(1);
    expect(out.days?.[1]?.label).toBe("Day 3");
  });

  it("drops empty names rather than printing blanks", () => {
    const out = toPublicPairings({
      published: {
        groups: [
          {
            number: 2,
            startHole: 10,
            time: "06:42",
            flight: "Regular B",
            players: ["", "   ", "Ramon Aguilar"],
          },
        ],
      },
      tournamentName: "Sample",
      dateLabel: "Sample",
      startFormat: "two_tee",
      firstTeeTime: "06:30",
    });
    expect(out.groups[0]?.players).toEqual([{ id: null, name: "RAMON AGUILAR", photoPath: null }]);
    expect(out.startFormat).toBe("two_tee");
  });
});

describe("toPublicProgramme", () => {
  const days: TournamentDay[] = [
    {
      id: "d1",
      dayNumber: 1,
      playDate: "2026-11-12",
      label: "Day 1",
      startTime: "06:30",
      isPlayingDay: true,
    },
    {
      id: "d2",
      dayNumber: 2,
      playDate: "2026-11-13",
      label: "Day 2",
      startTime: null,
      isPlayingDay: true,
    },
    {
      id: "d3",
      dayNumber: 3,
      playDate: "2026-11-14",
      label: "Day 3",
      startTime: null,
      isPlayingDay: false,
    },
  ];

  const player = {
    id: "p1",
    clubId: "c1",
    firstName: "Antonio",
    lastName: "Alcantara",
    nickname: null,
    name: "Antonio Alcantara",
    birthdate: "1972-05-04",
    gender: "M",
    homeCourse: "IGCC",
    contactNumber: "+63 917 000 0000",
    email: "antonio@example.com",
    ngapId: "1001",
    createdAt: "2026-10-01T00:00:00Z",
  } as PlayerRecord;

  const entry = {
    id: "e1",
    clubId: "c1",
    tournamentId: "t1",
    playerId: "p1",
    role: "member",
    sponsor: false,
    shirt: "L",
    teePreferences: {},
    selectedDays: [1, 2],
    dayTee: {
      1: { teeTime: "06:30", startHole: 1, wave: "A", confirmed: true },
      2: { teeTime: "12:30", startHole: 10, wave: null, confirmed: false },
    },
    declaredWshId: null,
    declaredWshHandicap: null,
    extra: {},
    paymentStatus: "pending",
    frozen: {
      index: 12.4,
      recordId: null,
      effectiveDate: null,
      frozenAt: "2026-11-01T00:00:00Z",
    },
    createdAt: "2026-11-01T00:00:00Z",
    source: "demo_seed",
  } as RegistrationEntry;

  const registration = {
    playerId: "p1",
    playerName: "Antonio Alcantara",
    status: "ok",
    reasons: [],
    index: 12.4,
    age: 54,
    categoryId: "cat-regular",
    teeId: "tee-white",
    playingHandicap: 14,
    flightId: "flt-a",
    entryId: "e1",
    role: "member",
    ageKnown: true,
    frozenIndex: 12.4,
    frozenRecordId: null,
    frozenEffectiveDate: null,
    newerRecord: null,
    frozenOutdated: false,
    staleIndex: false,
    flags: [],
    paymentStatus: "pending",
    sponsor: false,
    teePreferences: {},
    provisional: false,
    missing: [],
  } as DeskRegistration;

  it("lists only confirmed times and never a contact field or a birthdate", () => {
    const out = toPublicProgramme({
      days,
      entries: [entry],
      registrations: [registration],
      players: [player],
      categories: [
        {
          id: "cat-regular",
          name: "Regular",
          gender: "any",
          minAge: 0,
          maxAge: null,
          teeId: "tee-white",
        },
      ],
      flights: [{ id: "flt-a", categoryId: "cat-regular", name: "Regular A", min: 0, max: 18 }],
      rulesOfPlay: "  Play the ball as it lies.\r\n\r\nSign your card.  ",
    });

    // Day 3 is not a playing day, so it is not shown.
    expect(out.days.map((day) => day.dayNumber)).toEqual([1, 2]);
    expect(out.days[0]?.players).toEqual([
      { name: "ANTONIO ALCANTARA", teeTime: "06:30", startHole: 1, confirmed: true },
    ]);
    // A time that the desk has not confirmed is withheld, but the player stays on the day.
    expect(out.days[1]?.players).toEqual([
      { name: "ANTONIO ALCANTARA", teeTime: null, startHole: null, confirmed: false },
    ]);
    expect(out.players).toEqual([
      {
        name: "ANTONIO ALCANTARA",
        homeCourse: "IGCC",
        index: 12.4,
        category: "Regular",
        flight: "Regular A",
      },
    ]);
    expect(out.rulesOfPlay).toBe("Play the ball as it lies.\n\nSign your card.");

    const serialised = JSON.stringify(out);
    for (const privateFact of ["1972-05-04", "antonio@example.com", "+63 917", "photo"]) {
      expect(serialised).not.toContain(privateFact);
    }
  });

  it("leaves out an ineligible entry and keeps a player with no index as NH", () => {
    const out = toPublicProgramme({
      days,
      entries: [{ ...entry, id: "e2", playerId: "p2" }],
      registrations: [
        {
          ...registration,
          entryId: "e2",
          playerId: "p2",
          playerName: "Maria Santos",
          status: "ineligible",
        },
      ],
      players: [{ ...player, id: "p2", name: "Maria Santos", homeCourse: null }],
      categories: [],
      flights: [],
      rulesOfPlay: "   ",
    });
    expect(out.players).toEqual([]);
    expect(out.rulesOfPlay).toBeNull();
  });

  it("leaves out an entry that is still waiting for the desk, in both lists", () => {
    const out = toPublicProgramme({
      days,
      entries: [{ ...entry, id: "e3", playerId: "p3" }],
      registrations: [
        {
          ...registration,
          entryId: "e3",
          playerId: "p3",
          playerName: "Noel Yulo",
          status: "needs_review",
        },
      ],
      players: [{ ...player, id: "p3", name: "Noel Yulo", homeCourse: null }],
      categories: [],
      flights: [],
      rulesOfPlay: null,
    });
    // A signed-out visitor sees a name only after the desk confirms the entry.
    expect(out.players).toEqual([]);
    expect(out.days.flatMap((day) => day.players)).toEqual([]);
  });
});

describe("mapPublicProgramme", () => {
  it("accepts the database projection and normalises its times", () => {
    const out = mapPublicProgramme({
      days: [
        {
          dayNumber: 2,
          label: "Day 2",
          playDate: "2026-11-13",
          startTime: "07:00:00",
          players: [
            { name: "  Maria Santos ", teeTime: "12:30:00", startHole: 10, confirmed: true },
            { name: "Antonio Alcantara", teeTime: "06:30:00", startHole: 1, confirmed: false },
          ],
        },
      ],
      players: [
        {
          name: "Maria Santos",
          homeCourse: "IGCC",
          index: "8.2",
          category: "Ladies",
          flight: "Ladies A",
        },
        { name: "Antonio Alcantara", homeCourse: null, index: null, category: null, flight: null },
      ],
      rulesOfPlay: "  Local rules apply.  ",
    });

    expect(out?.days[0]?.startTime).toBe("07:00");
    // The unconfirmed row keeps the player but loses the tentative time.
    expect(out?.days[0]?.players).toEqual([
      { name: "MARIA SANTOS", teeTime: "12:30", startHole: 10, confirmed: true },
      { name: "ANTONIO ALCANTARA", teeTime: null, startHole: null, confirmed: false },
    ]);
    expect(out?.players[0]).toEqual({
      name: "ANTONIO ALCANTARA",
      homeCourse: null,
      index: null,
      category: null,
      flight: null,
    });
    expect(out?.players[1]?.index).toBe(8.2);
    expect(out?.rulesOfPlay).toBe("Local rules apply.");
  });

  it("returns null for a malformed or missing response", () => {
    expect(mapPublicProgramme(null)).toBeNull();
    expect(mapPublicProgramme({ days: [], players: "nope" })).toBeNull();
    expect(mapPublicProgramme({ days: [{ dayNumber: 1 }], players: [] })).toBeNull();
    expect(mapPublicProgramme({ days: [], players: [] })).toEqual({
      days: [],
      players: [],
      rulesOfPlay: null,
    });
  });
});
