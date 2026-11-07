import { describe, expect, it } from "vitest";
import type { ScheduleGroup } from "./rows";
import {
  countGroupSessions,
  dayState,
  filterGroupsBySession,
  filterScheduleByQuery,
  jumpTargetGroup,
  manilaNow,
  matchGroup,
  minutesOfTime,
  nextUpGroup,
  relativeTalk,
} from "./schedule";

function group(
  number: number,
  time: string,
  extra: Partial<ScheduleGroup> = {},
): ScheduleGroup {
  return {
    id: `g-1-${number}`,
    number,
    time,
    startHole: 1,
    flightId: "r-a",
    flightName: "Class A",
    players: [{ playerId: `p${number}`, playerName: `Player ${number}` }],
    arrived: 0,
    arrivals: [false],
    ...extra,
  };
}

// Thursday 12 Nov 2026, 06:00 in Manila, is 22:00 UTC on 11 Nov.
const BEFORE_FIRST = new Date("2026-11-11T22:00:00Z");
// Thursday 12 Nov 2026, 07:05 in Manila.
const DURING = new Date("2026-11-11T23:05:00Z");
// Thursday 12 Nov 2026, 17:00 in Manila.
const AFTER_LAST = new Date("2026-11-12T09:00:00Z");

describe("the club clock", () => {
  it("reads Manila wall time, not the device time zone", () => {
    expect(manilaNow(DURING)).toEqual({ iso: "2026-11-12", clock: "07:05", minutes: 425 });
    expect(minutesOfTime("06:30:00")).toBe(390);
    expect(minutesOfTime("not a time")).toBeNull();
  });

  it("places the viewed day against today", () => {
    const now = manilaNow(DURING);
    expect(dayState("2026-11-13", now)).toBe("before");
    expect(dayState("2026-11-12", now)).toBe("today");
    expect(dayState("2026-11-11", now)).toBe("after");
  });
});

describe("the tee sheet's next group", () => {
  const groups = [group(1, "06:30"), group(2, "06:38"), group(3, "12:30")];

  it("shows the first group before play starts", () => {
    expect(nextUpGroup(groups, "before", manilaNow(BEFORE_FIRST).minutes)?.number).toBe(1);
  });

  it("finds the group at or after now while the day runs", () => {
    expect(nextUpGroup(groups, "today", 390)?.number).toBe(1);
    expect(nextUpGroup(groups, "today", 391)?.number).toBe(2);
    expect(nextUpGroup(groups, "today", 23 * 60)).toBeNull();
  });

  it("jumps to the last group after the day, and to the first before it", () => {
    expect(jumpTargetGroup(groups, "before", 0)?.number).toBe(1);
    expect(jumpTargetGroup(groups, "today", 391)?.number).toBe(2);
    expect(jumpTargetGroup(groups, "today", 23 * 60)?.number).toBe(3);
    expect(jumpTargetGroup(groups, "after", 0)?.number).toBe(3);
    expect(jumpTargetGroup([], "today", 0)).toBeNull();
  });

  it("talks about a tee time in minutes", () => {
    expect(relativeTalk("06:30", 390)).toBe("now");
    expect(relativeTalk("06:30", 400)).toBe("10 min ago");
    expect(relativeTalk("12:30", 400)).toBe("in 350 min");
    expect(relativeTalk("", 400)).toBeNull();
  });

  it("does not use the device clock for the after-day decision", () => {
    expect(dayState("2026-11-12", manilaNow(AFTER_LAST))).toBe("today");
    expect(nextUpGroup(groups, "today", manilaNow(AFTER_LAST).minutes)).toBeNull();
  });
});

describe("sessions", () => {
  const groups = [group(1, "06:30"), group(2, "06:38"), group(3, "12:30"), group(4, "")];

  it("counts the groups in each session and the ones with no readable time", () => {
    expect(countGroupSessions(groups, 0, 4)).toEqual({ am: 2, pm: 1, unset: 1 });
  });

  it("keeps only the chosen session, and shows unreadable times under All day only", () => {
    expect(filterGroupsBySession(groups, "AM", 0, 4).map((g) => g.number)).toEqual([1, 2]);
    expect(filterGroupsBySession(groups, "PM", 0, 4).map((g) => g.number)).toEqual([3]);
    expect(filterGroupsBySession(groups, "all", 0, 4)).toHaveLength(4);
  });
});

describe("searching the tee sheet", () => {
  const groups = [
    group(7, "06:30", {
      flightName: "Class B",
      players: [
        { playerId: "p1", playerName: "Maria Santos" },
        { playerId: "p2", playerName: "Juan Dela Cruz" },
      ],
    }),
    group(12, "12:30", { startHole: 10, flightName: "Ladies" }),
  ];

  it("matches a player name and says which player matched", () => {
    expect(matchGroup(groups[0] as ScheduleGroup, "santos")).toEqual({
      matched: true,
      playerIds: ["p1"],
    });
    expect(filterScheduleByQuery(groups, "dela cruz")).toHaveLength(1);
  });

  it("matches a group number, a flight, a hole and a clock time", () => {
    expect(matchGroup(groups[1] as ScheduleGroup, "12").matched).toBe(true);
    expect(matchGroup(groups[0] as ScheduleGroup, "class b").matched).toBe(true);
    expect(matchGroup(groups[1] as ScheduleGroup, "10").matched).toBe(true);
    expect(matchGroup(groups[1] as ScheduleGroup, "12:30").matched).toBe(true);
    expect(matchGroup(groups[0] as ScheduleGroup, "zzz").matched).toBe(false);
  });

  it("treats an empty search as everything", () => {
    expect(filterScheduleByQuery(groups, "   ")).toHaveLength(2);
  });
});
