import { describe, expect, it } from "vitest";
import { filterRoster, rosterFlights, toPublicRoster } from "./public";
import type { PublicProgramme, PublicRosterPlayer } from "./types";

/**
 * The five fields the roster may carry. This object has to name every key of `PublicRosterPlayer`
 * exactly, so adding a field to the type fails typecheck until someone writes it down here on
 * purpose. That is the compile-time half of the allow-list.
 */
const ALLOWED_FIELDS: Record<keyof PublicRosterPlayer, true> = {
  name: true,
  homeCourse: true,
  index: true,
  category: true,
  flight: true,
};

describe("toPublicRoster", () => {
  it("keeps only the allow-listed fields, even when the source carries the whole event", () => {
    const source = {
      days: [
        {
          dayNumber: 1,
          label: "Day 1",
          playDate: "2026-11-12",
          startTime: "06:30",
          players: [{ name: "Antonio Alcantara", teeTime: "06:30", startHole: 1, confirmed: true }],
        },
      ],
      players: [
        {
          name: "Antonio Alcantara",
          homeCourse: "IGCC",
          index: 12.4,
          category: "Regular",
          flight: "Regular A",
          // A richer registration or player row could carry all of these; none may survive.
          pairingKey: "day-1-group-2",
          teeTime: "06:30",
          startHole: 1,
          groupNumber: 2,
          email: "antonio@example.com",
          phone: "+63 917 000 0000",
          birthdate: "1972-05-04",
          gender: "M",
          notes: "Organizer only",
          photoPath: "private/antonio.jpg",
          publicPhotoPath: "public/antonio.jpg",
        },
      ],
      rulesOfPlay: "Organizers only",
    } as unknown as PublicProgramme;

    const roster = toPublicRoster(source);

    expect(roster).toEqual({
      players: [
        {
          name: "Antonio Alcantara",
          homeCourse: "IGCC",
          index: 12.4,
          category: "Regular",
          flight: "Regular A",
        },
      ],
    });
    expect(Object.keys(roster.players[0] ?? {}).sort()).toEqual(Object.keys(ALLOWED_FIELDS).sort());

    const serialised = JSON.stringify(roster);
    for (const leak of [
      "06:30",
      "day-1-group-2",
      "groupNumber",
      "antonio@example.com",
      "+63 917",
      "1972-05-04",
      "Organizer only",
      "private/antonio.jpg",
      "public/antonio.jpg",
    ]) {
      expect(serialised).not.toContain(leak);
    }
    expect(serialised).not.toMatch(
      /teeTime|startHole|pairing|group|contact|email|phone|birthdate|gender|notes|photo/i,
    );
  });

  it("sorts the roster by name and keeps a missing club or index as null", () => {
    const roster = toPublicRoster({
      days: [],
      players: [
        {
          name: "Noel Yulo",
          homeCourse: null,
          index: null,
          category: null,
          flight: null,
        },
        {
          name: "Antonio Alcantara",
          homeCourse: "IGCC",
          index: 12.4,
          category: "Regular",
          flight: "Regular A",
        },
      ],
      rulesOfPlay: null,
    });

    expect(roster.players).toEqual([
      {
        name: "Antonio Alcantara",
        homeCourse: "IGCC",
        index: 12.4,
        category: "Regular",
        flight: "Regular A",
      },
      {
        name: "Noel Yulo",
        homeCourse: null,
        index: null,
        category: null,
        flight: null,
      },
    ]);
  });
});

const players: PublicRosterPlayer[] = [
  {
    name: "Antonio Alcantara",
    homeCourse: "IGCC",
    index: 12.4,
    category: "Regular",
    flight: "Regular A",
  },
  {
    name: "José Peña",
    homeCourse: "Negros",
    index: 8.2,
    category: "Senior",
    flight: "Regular B",
  },
  {
    name: "Maria Santos",
    homeCourse: "IGCC",
    index: null,
    category: "Ladies",
    flight: "Ladies A",
  },
  {
    name: "Noel Yulo",
    homeCourse: null,
    index: -2.3,
    category: null,
    flight: null,
  },
];

describe("filterRoster", () => {
  it("matches a partial name without caring about case", () => {
    expect(filterRoster(players, { query: "anton" }).map((player) => player.name)).toEqual([
      "Antonio Alcantara",
    ]);
    expect(filterRoster(players, { query: "SANTOS" }).map((player) => player.name)).toEqual([
      "Maria Santos",
    ]);
    expect(filterRoster(players, { query: "  alc  " }).map((player) => player.name)).toEqual([
      "Antonio Alcantara",
    ]);
  });

  it("matches a name typed without accents", () => {
    expect(filterRoster(players, { query: "pena" }).map((player) => player.name)).toEqual([
      "José Peña",
    ]);
  });

  it("returns only the selected flight and clearing it restores the full list", () => {
    expect(filterRoster(players, { flight: "Ladies A" }).map((player) => player.name)).toEqual([
      "Maria Santos",
    ]);
    expect(filterRoster(players, { flight: "" })).toHaveLength(players.length);
    expect(filterRoster(players)).toEqual(players);
  });

  it("combines the name search and the flight filter", () => {
    expect(
      filterRoster(players, { query: "mar", flight: "Ladies A" }).map((player) => player.name),
    ).toEqual(["Maria Santos"]);
    expect(filterRoster(players, { query: "mar", flight: "Regular A" })).toEqual([]);
  });

  it("lists each distinct flight once, sorted, and leaves no-flight players out of the options", () => {
    expect(
      rosterFlights([
        ...players,
        { ...players[0]!, name: "Another Regular", flight: "Regular A" },
        { ...players[0]!, name: "Blank Flight", flight: "   " },
      ]),
    ).toEqual(["Ladies A", "Regular A", "Regular B"]);
  });
});
