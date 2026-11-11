import { describe, expect, it } from "vitest";
import {
  matchPairingNames,
  type PairingCandidate,
  type PairingGroup,
} from "@/lib/import/pairing-sheet";
import { applyPairingSheet, pairingMatchKey } from "./apply-pairing-sheet";
import type { DrawGroup } from "./validate";

const roster: PairingCandidate[] = [
  { registrationId: "reg-mira", fullName: "Mira Salvador" },
  { registrationId: "reg-jun", fullName: "Jun Tanaka" },
  { registrationId: "reg-fable", fullName: "Fable Orsolino" },
];

const flightOf = (registrationId: string) =>
  registrationId === "reg-mira"
    ? "flight-a"
    : registrationId === "reg-jun"
      ? "flight-b"
      : "flight-z";

function sheetGroup(overrides: Partial<PairingGroup> = {}): PairingGroup {
  return {
    session: "AM",
    teeTime: "06:30",
    startFormat: "shotgun",
    hole: 1,
    slot: "A",
    names: [],
    row: 0,
    ...overrides,
  };
}

function matchOf(groups: PairingGroup[], candidates: PairingCandidate[] = roster) {
  return matchPairingNames(groups, candidates);
}

function apply(groups: PairingGroup[], confirmed: ReadonlySet<string> = new Set()) {
  return applyPairingSheet({
    sheetGroups: groups,
    match: matchOf(groups),
    confirmed,
    currentGroups: [],
    flightOf,
  });
}

describe("applyPairingSheet", () => {
  it("places exact matches with the sheet's hole and tee time", () => {
    const groups = [sheetGroup({ hole: 7, names: ["SALVADOR, MIRA", "TANAKA, JUN"], row: 4 })];

    const result = apply(groups);

    expect(result.groups).toEqual([
      {
        number: 1,
        flightId: "flight-a",
        playerIds: ["reg-mira", "reg-jun"],
        startHole: 7,
        wave: null,
        time: "06:30",
        locked: false,
      },
    ]);
    expect(result.report.placed).toBe(2);
    expect(result.report.matchedPlaced).toBe(2);
    expect(result.report.groupsCreated).toBe(1);
  });

  it("leaves an unticked fuzzy suggestion off the board", () => {
    const groups = [sheetGroup({ hole: 3, names: ["RONEL ONG"] })];
    const match = matchOf(groups, [{ registrationId: "reg-ron", fullName: "Ronnel Ong" }]);
    expect(match.matches[0]?.status).toBe("fuzzy");

    const result = applyPairingSheet({
      sheetGroups: groups,
      match,
      confirmed: new Set(),
      currentGroups: [],
      flightOf,
    });

    expect(result.groups).toEqual([]);
    expect(result.report.fuzzySkipped).toBe(1);
    expect(result.report.suggestions).toEqual([
      {
        key: "0:0",
        raw: "RONEL ONG",
        candidateName: "Ronnel Ong",
        registrationId: "reg-ron",
        session: "AM",
        hole: 3,
      },
    ]);
  });

  it("places a fuzzy suggestion once the organizer ticks it", () => {
    const groups = [sheetGroup({ hole: 3, names: ["RONEL ONG"] })];
    const match = matchOf(groups, [{ registrationId: "reg-ron", fullName: "Ronnel Ong" }]);
    const first = match.matches[0];
    expect(first).toBeDefined();

    const result = applyPairingSheet({
      sheetGroups: groups,
      match,
      confirmed: new Set(first ? [pairingMatchKey(first)] : []),
      currentGroups: [],
      flightOf,
    });

    expect(result.groups[0]?.playerIds).toEqual(["reg-ron"]);
    expect(result.report.fuzzyPlaced).toBe(1);
    expect(result.report.fuzzySkipped).toBe(0);
  });

  it("reports a name that was not found, with its hole and session, and does not place it", () => {
    const groups = [
      sheetGroup({
        session: "PM",
        teeTime: "12:30",
        hole: 12,
        names: ["ZARAGOZA, WENCESLAO"],
      }),
    ];
    const match = matchOf(groups, []);
    expect(match.matches[0]?.status).toBe("not_found");

    const result = applyPairingSheet({
      sheetGroups: groups,
      match,
      confirmed: new Set(),
      currentGroups: [],
      flightOf,
    });

    expect(result.groups).toEqual([]);
    expect(result.report.notFound).toBe(1);
    expect(result.report.unplaced).toEqual([
      {
        raw: "ZARAGOZA, WENCESLAO",
        status: "not_found",
        session: "PM",
        hole: 12,
      },
    ]);
  });

  it("reports an ambiguous name with its alternatives and does not guess", () => {
    const groups = [sheetGroup({ names: ["SALVADOR, MIRA"] })];
    const tied: PairingCandidate[] = [
      { registrationId: "reg-1", fullName: "Mira Salvador" },
      { registrationId: "reg-2", fullName: "Mira Salvador" },
    ];
    const match = matchOf(groups, tied);
    expect(match.matches[0]?.status).toBe("ambiguous");

    const result = applyPairingSheet({
      sheetGroups: groups,
      match,
      confirmed: new Set(),
      currentGroups: [],
      flightOf,
    });

    expect(result.groups).toEqual([]);
    expect(result.report.ambiguous).toBe(1);
    expect(result.report.unplaced[0]?.status).toBe("ambiguous");
    expect(result.report.unplaced[0]?.alternatives).toHaveLength(2);
  });

  it("does not create a group when every name on the row is unplaced", () => {
    const groups = [
      sheetGroup({ hole: 1, names: ["UNKNOWN, NAME"], row: 0 }),
      sheetGroup({ hole: 2, names: ["SALVADOR, MIRA"], row: 1 }),
    ];

    const result = apply(groups);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.number).toBe(1);
    expect(result.groups[0]?.startHole).toBe(2);
    expect(result.groups[0]?.playerIds).toEqual(["reg-mira"]);
  });

  it("leaves another day's groups untouched when this day is replaced", () => {
    const otherDay: DrawGroup[] = [
      {
        number: 1,
        flightId: "flight-b",
        playerIds: ["reg-jun"],
        startHole: 10,
        wave: null,
        time: "12:30",
        locked: false,
      },
    ];
    const currentDay: DrawGroup[] = [
      {
        number: 1,
        flightId: "flight-a",
        playerIds: ["reg-mira"],
        startHole: 1,
        wave: null,
        time: "06:30",
        locked: false,
      },
    ];
    const otherBefore = JSON.stringify(otherDay);
    const currentBefore = JSON.stringify(currentDay);

    const groups = [sheetGroup({ hole: 3, names: ["TANAKA, JUN"] })];
    const result = applyPairingSheet({
      sheetGroups: groups,
      match: matchOf(groups),
      confirmed: new Set(),
      currentGroups: currentDay,
      flightOf,
    });

    expect(JSON.stringify(otherDay)).toBe(otherBefore);
    expect(JSON.stringify(currentDay)).toBe(currentBefore);
    expect(result.groups[0]).not.toBe(currentDay[0]);
    expect(result.report.groupsReplaced).toBe(1);
  });

  it("numbers groups in sheet order and takes each tee time from the sheet", () => {
    const groups = [
      sheetGroup({ session: "AM", teeTime: "06:30", hole: 1, names: ["SALVADOR, MIRA"], row: 0 }),
      sheetGroup({ session: "AM", teeTime: "06:30", hole: 2, names: ["TANAKA, JUN"], row: 1 }),
      sheetGroup({ session: "PM", teeTime: "12:30", hole: 1, names: ["ORSOLINO, FABLE"], row: 2 }),
    ];

    const result = apply(groups);

    expect(result.groups.map((group) => group.number)).toEqual([1, 2, 3]);
    expect(result.groups.map((group) => group.time)).toEqual(["06:30", "06:30", "12:30"]);
    expect(result.groups.map((group) => group.startHole)).toEqual([1, 2, 1]);
    expect(result.groups[0]?.playerIds).toEqual(["reg-mira"]);
    expect(result.groups[1]?.playerIds).toEqual(["reg-jun"]);
    expect(result.groups[2]?.playerIds).toEqual(["reg-fable"]);
  });

  it("takes the group's flight from the first player actually placed", () => {
    const groups = [sheetGroup({ names: ["UNKNOWN, NAME", "TANAKA, JUN"] })];

    const result = apply(groups);

    expect(result.groups[0]?.playerIds).toEqual(["reg-jun"]);
    expect(result.groups[0]?.flightId).toBe("flight-b");
    expect(result.report.unplaced.map((entry) => entry.raw)).toEqual(["UNKNOWN, NAME"]);
  });
});
