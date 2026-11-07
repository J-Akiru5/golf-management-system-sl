import { describe, expect, it } from "vitest";
import type { RegistrationEntry } from "@/lib/data/types";
import {
  buildRows,
  buildSchedule,
  filterRows,
  matchesQuery,
  parseStaffGroupId,
  rowsInGroup,
  type StaffGroup,
  type StaffPerson,
  staffGroupId,
  summarise,
  unplacedRows,
} from "./rows";

function entry(overrides: Partial<RegistrationEntry> & { id: string; playerId: string }) {
  const base: RegistrationEntry = {
    id: overrides.id,
    clubId: "club",
    tournamentId: "event",
    playerId: overrides.playerId,
    role: "member",
    sponsor: null,
    shirt: null,
    teePreferences: {},
    selectedDays: [3],
    dayTee: {},
    declaredWshId: null,
    declaredWshHandicap: null,
    extra: {},
    paymentStatus: "pending",
    frozen: {
      index: 10,
      recordId: null,
      effectiveDate: "2026-10-01",
      frozenAt: "2026-11-01T00:00:00.000Z",
    },
    createdAt: "2026-11-01T00:00:00.000Z",
    source: "desk",
    status: "ok",
  };
  return { ...base, ...overrides };
}

const people = new Map<string, StaffPerson>([
  ["p1", { playerId: "p1", playerName: "ALPHA, ANA", contactNumber: "0917 111 1111" }],
  ["p2", { playerId: "p2", playerName: "BRAVO, BEN", contactNumber: "0918 222 2222" }],
  ["p3", { playerId: "p3", playerName: "CHARLIE, CARL", contactNumber: null }],
  ["p4", { playerId: "p4", playerName: "DELTA, DAN", contactNumber: null }],
]);

const groups: StaffGroup[] = [
  {
    id: "g-10",
    number: 10,
    time: "12:30",
    startHole: 4,
    flightId: "class-a",
    players: [
      { playerId: "p1", playerName: "ALPHA, ANA" },
      { playerId: "p2", playerName: "BRAVO, BEN" },
    ],
  },
  {
    id: "g-2",
    number: 2,
    time: "06:30:00",
    startHole: 9,
    flightId: "class-b",
    players: [{ playerId: "p3", playerName: "CHARLIE, CARL" }],
  },
];

const base = {
  people,
  groups,
  dayNumber: 3,
  dayIndex: 2,
  dayCount: 4,
};

describe("staff rows", () => {
  const rows = buildRows({
    ...base,
    entries: [
      entry({ id: "e1", playerId: "p1", status: "needs_review" }),
      entry({
        id: "e2",
        playerId: "p2",
        dayCheckIn: { 3: { at: "2026-11-14T06:05:00.000Z", byName: "Ana" } },
      }),
      entry({ id: "e3", playerId: "p3", selectedDays: [3, 4] }),
      entry({
        id: "e4",
        playerId: "p4",
        dayTee: { 3: { teeTime: "06:50", startHole: 7, wave: null, confirmed: true } },
      }),
      entry({ id: "e5", playerId: "p4", selectedDays: [4] }),
    ],
  });

  it("keeps one row per player entered for that day, in tee order", () => {
    expect(rows.map((row) => row.entryId)).toEqual(["e3", "e4", "e1", "e2"]);
  });

  it("reads the group's tee and hole, and the stored tee when it has one", () => {
    const alpha = rows.find((row) => row.entryId === "e1");
    expect(alpha?.teeTime).toBe("12:30");
    expect(alpha?.startHole).toBe(4);
    const delta = rows.find((row) => row.entryId === "e4");
    expect(delta?.teeTime).toBe("06:50");
    expect(delta?.startHole).toBe(7);
    expect(delta?.group).toBeNull();
  });

  it("prefers the desk's session, then the tee time", () => {
    const rowsWithChosen = buildRows({
      ...base,
      entries: [
        entry({ id: "e1", playerId: "p1", daySessions: { 3: "PM" } }),
        entry({ id: "e2", playerId: "p2" }),
        entry({ id: "e3", playerId: "p3" }),
        entry({
          id: "e4",
          playerId: "p4",
          dayTee: { 3: { teeTime: "13:10", startHole: 2, wave: null, confirmed: true } },
        }),
      ],
    });
    expect(rowsWithChosen.find((row) => row.entryId === "e1")?.session).toBe("PM");
    expect(rowsWithChosen.find((row) => row.entryId === "e2")?.session).toBe("PM");
    expect(rowsWithChosen.find((row) => row.entryId === "e3")?.session).toBe("AM");
    expect(rowsWithChosen.find((row) => row.entryId === "e4")?.session).toBe("PM");
  });

  it("leaves the session unset rather than guessing one", () => {
    const [row] = buildRows({
      ...base,
      groups: [],
      entries: [entry({ id: "e9", playerId: "p4", dayTee: {} })],
    });
    expect(row?.session).toBeNull();
    expect(row?.teeTime).toBeNull();
  });

  it("counts arrivals, review flags and players the draw has not placed", () => {
    expect(summarise(rows)).toEqual({
      total: 4,
      arrived: 1,
      notArrived: 3,
      needsReview: 1,
      unplaced: 1,
    });
  });

  it("filters and searches, including by phone digits and group number", () => {
    expect(filterRows(rows, "arrived").map((row) => row.entryId)).toEqual(["e2"]);
    expect(filterRows(rows, "not-arrived")).toHaveLength(3);
    expect(filterRows(rows, "needs-review").map((row) => row.entryId)).toEqual(["e1"]);
    expect(filterRows(rows, "all", "bravo").map((row) => row.entryId)).toEqual(["e2"]);
    expect(filterRows(rows, "all", "2222").map((row) => row.entryId)).toEqual(["e2"]);
    const groupTen = rows.find((row) => row.group?.number === 10)!;
    expect(matchesQuery(groupTen, "10")).toBe(true);
    expect(matchesQuery(groupTen, "zzz")).toBe(false);
  });

  it("lists a group's players and the players still unplaced", () => {
    expect(rowsInGroup(rows, "g-10").map((row) => row.entryId)).toEqual(["e1", "e2"]);
    expect(unplacedRows(rows).map((row) => row.entryId)).toEqual(["e4"]);
  });

  it("puts the day in the group's address and reads it back", () => {
    expect(staffGroupId(3, 12)).toBe("g-3-12");
    expect(parseStaffGroupId("g-3-12")).toEqual({ dayNumber: 3, groupNumber: 12 });
    expect(parseStaffGroupId("g-3")).toBeNull();
    expect(parseStaffGroupId("g-x-12")).toBeNull();
    expect(parseStaffGroupId("12")).toBeNull();
  });

  it("orders the schedule by tee time and says how many have arrived", () => {
    const schedule = buildSchedule(groups, rows, (id) =>
      id === "class-a" ? "Class A" : "Class B",
    );
    expect(schedule.map((group) => group.number)).toEqual([2, 10]);
    expect(schedule[1]).toMatchObject({ flightName: "Class A", arrived: 1 });
  });
});
