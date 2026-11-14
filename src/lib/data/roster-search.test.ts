import { describe, expect, it } from "vitest";
import { filterRoster } from "./public";
import type { PublicRosterPlayer } from "./types";

/**
 * The names below are stored the way the desk writes a card: family name first, in capitals, a
 * comma between the halves. The old roster matcher compared the whole typed string against that
 * one line, so "charles matiling" found nothing while "matiling" found him. Every case here is a
 * way a player actually types their name.
 */
const players: PublicRosterPlayer[] = [
  {
    id: "p1",
    name: "MATILING, CHARLES",
    homeCourse: "IGCC",
    index: 12.4,
    category: "Regular",
    flight: "Regular A",
  },
  {
    id: "p2",
    name: "PEÑA, JOSÉ",
    homeCourse: "Negros",
    index: 8.2,
    category: "Senior",
    flight: "Regular B",
  },
  {
    id: "p3",
    name: "DELA CRUZ, JUAN P.",
    homeCourse: "IGCC",
    index: null,
    category: "Ladies",
    flight: "Ladies A",
  },
];

const names = (query: string) => filterRoster(players, { query }).map((player) => player.name);

describe("filterRoster with LAST, FIRST names", () => {
  it("finds a player who types their first name before their family name", () => {
    expect(names("charles matiling")).toEqual(["MATILING, CHARLES"]);
  });

  it("finds the same player with the comma, without it, or in the stored order", () => {
    expect(names("matiling, charles")).toEqual(["MATILING, CHARLES"]);
    expect(names("MATILING CHARLES")).toEqual(["MATILING, CHARLES"]);
    expect(names("matiling")).toEqual(["MATILING, CHARLES"]);
  });

  it("matches partial words as they are typed", () => {
    expect(names("char mat")).toEqual(["MATILING, CHARLES"]);
    expect(names("juan cruz")).toEqual(["DELA CRUZ, JUAN P."]);
  });

  it("ignores accents typed either way", () => {
    expect(names("jose pena")).toEqual(["PEÑA, JOSÉ"]);
    expect(names("josé peña")).toEqual(["PEÑA, JOSÉ"]);
  });

  it("keeps the stored order of the words and the stored capitals untouched", () => {
    expect(names("matiling")).toEqual(["MATILING, CHARLES"]);
  });

  it("forgives a word the roster carries nowhere, and only that", () => {
    // A member types the name they know. Where the stored record is shorter, the word it never had
    // must not hide the surname beside it: this is "CAPALUNGAN, RUTH" searched at the desk as
    // "RACHELLE CAPALUNGAN".
    expect(names("RACHELLE MATILING")).toEqual(["MATILING, CHARLES"]);
    // A word that does belong to somebody is not forgiven, so a mistaken surname still finds nobody.
    expect(names("charles peña")).toEqual([]);
    // A query made only of words the field never carries answers nothing, not the whole roster.
    expect(names("zzzz")).toEqual([]);
  });

  it("still treats a blank query as the whole field", () => {
    expect(names("")).toHaveLength(3);
    expect(names("   ")).toHaveLength(3);
  });

  it("still combines the name match with the flight filter", () => {
    expect(filterRoster(players, { query: "matiling", flight: "Regular A" })).toHaveLength(1);
    expect(filterRoster(players, { query: "matiling", flight: "Ladies A" })).toHaveLength(0);
  });
});
