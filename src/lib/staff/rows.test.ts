import { describe, expect, it } from "vitest";
import type { RegistrationEntry } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import { placementOf, removePlayerFromDraw, restorePlayerToDraw } from "@/lib/draw/withdraw";
import {
  arrivalFilterFromQuery,
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

const flightName = (id: string | null) => (id === "class-a" ? "Class A" : "Class B");

/** The board in the shape the draw stores it, so the withdrawal helpers can work on it. */
const drawOf = (source: StaffGroup[]): DrawGroup[] =>
  source.map((group) => ({
    number: group.number,
    startHole: group.startHole,
    time: group.time,
    wave: null,
    flightId: group.flightId,
    playerIds: group.players.map((player) => player.playerId),
    locked: false,
  }));

/** The board as the staff app reads it, the way useStaffRows maps it. */
const staffOf = (source: DrawGroup[]): StaffGroup[] =>
  source.map((group) => ({
    id: `g-${group.number}`,
    number: group.number,
    time: group.time,
    startHole: group.startHole,
    flightId: group.flightId,
    players: group.playerIds.map((id) => ({
      playerId: id,
      playerName: people.get(id)?.playerName ?? "Unknown player",
    })),
  }));

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

  it("reads the filter the add screen asks for, and falls back to not arrived", () => {
    expect(arrivalFilterFromQuery("needs-review")).toBe("needs-review");
    expect(arrivalFilterFromQuery("all")).toBe("all");
    expect(arrivalFilterFromQuery("arrived")).toBe("arrived");
    expect(arrivalFilterFromQuery("not-arrived")).toBe("not-arrived");
    expect(arrivalFilterFromQuery(null)).toBe("not-arrived");
    expect(arrivalFilterFromQuery("bogus")).toBe("not-arrived");
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
    // One tick per roster spot, in the same order the group screen lists the players.
    expect(schedule[0]?.arrivals).toEqual([false]);
    expect(schedule[1]?.arrivals).toEqual([false, true]);
  });

  it("walks a placed player to the group's tee, not a stale tee left on the entry", () => {
    const [row] = buildRows({
      ...base,
      entries: [
        entry({
          id: "e1",
          playerId: "p1",
          dayTee: { 3: { teeTime: "13:10", startHole: 1, wave: null, confirmed: true } },
        }),
      ],
    });
    expect(row?.teeTime).toBe("12:30");
    expect(row?.startHole).toBe(4);
    expect(row?.session).toBe("PM");
  });

  it("flags a walk-up the desk has not cleared, even with no status on the entry", () => {
    const [row] = buildRows({
      ...base,
      groups: [],
      entries: [entry({ id: "e1", playerId: "p1", status: undefined })],
      statusByPlayer: new Map([["p1", "needs_review" as const]]),
    });
    expect(row?.needsReview).toBe(true);
  });

  it("keeps the group, its ticks and the player list in step when a player withdraws and is put back", () => {
    const e1 = entry({ id: "e1", playerId: "p1", status: "needs_review" });
    const e2 = entry({
      id: "e2",
      playerId: "p2",
      dayCheckIn: { 3: { at: "2026-11-14T06:05:00.000Z", byName: "Ana" } },
    });
    const e3 = entry({ id: "e3", playerId: "p3", selectedDays: [3, 4] });
    const e4 = entry({ id: "e4", playerId: "p4", selectedDays: [4] });

    const draw = drawOf(groups);
    const placement = placementOf(draw, "p2");
    expect(placement).toEqual({ groupNumber: 10, index: 1 });

    // Withdrawn: the entry leaves day 3 and the draw loses the player from the group.
    const withdrawnDraw = removePlayerFromDraw(draw, "p2");
    const withdrawnEntries = [e1, { ...e2, selectedDays: [4] }, e3, e4];
    const withdrawnRows = buildRows({
      ...base,
      groups: staffOf(withdrawnDraw),
      entries: withdrawnEntries,
    });
    const withdrawnSchedule = buildSchedule(staffOf(withdrawnDraw), withdrawnRows, flightName);
    const withdrawnGroup = withdrawnSchedule.find((group) => group.number === 10);
    expect(withdrawnGroup?.players.map((player) => player.playerId)).toEqual(["p1"]);
    expect(withdrawnGroup?.arrived).toBe(0);
    expect(withdrawnGroup?.arrivals).toEqual([false]);
    expect(rowsInGroup(withdrawnRows, "g-10").map((row) => row.entryId)).toEqual(["e1"]);

    // Undone: the entry returns to day 3 and the player goes back to the same slot.
    const restoredDraw = restorePlayerToDraw(
      withdrawnDraw,
      "p2",
      placement ?? {
        groupNumber: 10,
        index: 1,
      },
    );
    const restoredRows = buildRows({
      ...base,
      groups: staffOf(restoredDraw),
      entries: [e1, e2, e3, e4],
    });
    const restoredSchedule = buildSchedule(staffOf(restoredDraw), restoredRows, flightName);
    const restoredGroup = restoredSchedule.find((group) => group.number === 10);
    expect(restoredGroup?.players.map((player) => player.playerId)).toEqual(["p1", "p2"]);
    expect(restoredGroup?.arrived).toBe(1);
    expect(restoredGroup?.arrivals).toEqual([false, true]);
    expect(rowsInGroup(restoredRows, "g-10").map((row) => row.entryId)).toEqual(["e1", "e2"]);
  });

  it("shows a walk-up saved for review as needing review even when its routing status is ok", () => {
    const e4 = entry({
      id: "e4",
      playerId: "p4",
      status: "needs_review",
      reasons: ["No group in this player's class has an open place in the PM session."],
    });
    const rows = buildRows({
      ...base,
      entries: [e4],
      statusByPlayer: new Map([["p4", "ok" as const]]),
    });
    const row = rows.find((candidate) => candidate.playerId === "p4");
    expect(row?.needsReview).toBe(true);
    expect(row?.reviewReasons).toEqual([
      "No group in this player's class has an open place in the PM session.",
    ]);
    expect(row?.group).toBeNull();

    // The board still has only the drawn players: no phantom place for the walk-up.
    const schedule = buildSchedule(groups, rows, flightName);
    expect(
      schedule.flatMap((group) => group.players.map((player) => player.playerId)),
    ).not.toContain("p4");
  });
});
