import { describe, expect, it } from "vitest";
import type { FlightRule, Registration } from "@/lib/routing";
import { classMismatches, classMismatchIssues } from "./class-mismatch";
import type { DrawGroup } from "./validate";

let seq = 0;
const group = (
  over: Partial<DrawGroup> & Pick<DrawGroup, "flightId" | "startHole" | "time">,
): DrawGroup => {
  seq += 1;
  return {
    number: seq,
    playerIds: ["p1", "p2", "p3", "p4"],
    wave: null,
    locked: false,
    ...over,
  } satisfies DrawGroup;
};

const reg = (playerId: string, flightId: string | null, playerName = playerId): Registration => ({
  playerId,
  playerName,
  status: "ok",
  reasons: [],
  index: 10,
  age: 40,
  categoryId: "regular",
  teeId: "blue",
  playingHandicap: 12,
  flightId,
});

const flights: FlightRule[] = [
  { id: "a", categoryId: "regular", name: "Class A", min: -10, max: 12 },
  { id: "b", categoryId: "regular", name: "Class B", min: 12.1, max: 18 },
];

describe("classMismatches", () => {
  it("reports nothing when every player is in the group's class", () => {
    const draw = [group({ flightId: "a", startHole: 1, time: "06:30" })];
    const registrations = draw[0]?.playerIds.map((id) => reg(id, "a")) ?? [];

    expect(classMismatches({ draw, registrations, flights })).toEqual([]);
  });

  it("names the player's new class and the class the group was drawn in", () => {
    const draw = [group({ flightId: "a", startHole: 1, time: "06:30" })];
    const registrations = [
      reg("p1", "a", "Ada Cruz"),
      reg("p2", "b", "Ben Reyes"),
      reg("p3", "a"),
      reg("p4", "a"),
    ];

    const [only] = classMismatches({ draw, registrations, flights });

    expect(only?.group).toBe(draw[0]?.number);
    expect(only?.groupClassName).toBe("Class A");
    expect(only?.players).toHaveLength(1);
    expect(only?.players[0]).toMatchObject({
      playerId: "p2",
      playerName: "Ben Reyes",
      classId: "b",
      className: "Class B",
      groupClassName: "Class A",
      note: "Class B, group is Class A",
    });
  });

  it("leaves a player with no class out: that is the Unclassified case, not a mismatch", () => {
    const draw = [group({ flightId: "a", startHole: 1, time: "06:30" })];
    const registrations = [reg("p1", null), reg("p2", "a"), reg("p3", "a"), reg("p4", "a")];

    expect(classMismatches({ draw, registrations, flights })).toEqual([]);
  });

  it("skips a player with no registration rather than guessing a class", () => {
    const draw = [group({ flightId: "a", startHole: 1, time: "06:30" })];
    const registrations = [reg("p1", "b")];

    const [only] = classMismatches({ draw, registrations, flights });
    expect(only?.players.map((p) => p.playerId)).toEqual(["p1"]);
  });

  it("keeps the draw order and only returns the groups that differ", () => {
    const clean = group({ flightId: "a", startHole: 1, time: "06:30", playerIds: ["p1"] });
    const changed = group({ flightId: "b", startHole: 2, time: "06:30", playerIds: ["p2", "p3"] });
    const cleanAgain = group({ flightId: "a", startHole: 3, time: "06:30", playerIds: ["p4"] });
    const registrations = [reg("p1", "a"), reg("p2", "a"), reg("p3", "b"), reg("p4", "a")];

    const result = classMismatches({
      draw: [clean, changed, cleanAgain],
      registrations,
      flights,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.group).toBe(changed.number);
    expect(result[0]?.players.map((p) => p.playerId)).toEqual(["p2"]);
  });

  it("shows a class id it cannot name instead of inventing a name", () => {
    const draw = [group({ flightId: "a", startHole: 1, time: "06:30" })];
    const registrations = [reg("p1", "e")];

    const [only] = classMismatches({ draw, registrations, flights });
    expect(only?.players[0]?.className).toBe("e");
    expect(only?.players[0]?.note).toBe("e, group is Class A");
  });

  it("compares class ids, not names, when two class rows share a name", () => {
    const draw = [group({ flightId: "a", startHole: 1, time: "06:30" })];
    const registrations = [reg("p1", "c")];
    const sameName: FlightRule[] = [
      ...flights,
      { id: "c", categoryId: "regular", name: "Class A", min: 20, max: 24 },
    ];

    const [only] = classMismatches({ draw, registrations, flights: sameName });
    expect(only?.players[0]?.classId).toBe("c");
  });
});

describe("classMismatchIssues", () => {
  it("reports each mismatch as an information note that names both classes", () => {
    const draw = [group({ flightId: "a", startHole: 1, time: "06:30" })];
    const registrations = [reg("p1", "b", "Ben Reyes")];
    const issues = classMismatchIssues(classMismatches({ draw, registrations, flights }));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: "class-mismatch-p1",
      severity: "info",
      playerId: "p1",
    });
    expect(issues[0]?.group).toBe(draw[0]?.number);
    expect(issues[0]?.message).toContain("Class A");
    expect(issues[0]?.message).toContain("Class B");
    expect(issues[0]?.message).toContain("Ben Reyes");
  });

  it("reports nothing for a board whose classes agree", () => {
    const draw = [group({ flightId: "a", startHole: 1, time: "06:30" })];
    const registrations = draw[0]?.playerIds.map((id) => reg(id, "a")) ?? [];

    expect(classMismatchIssues(classMismatches({ draw, registrations, flights }))).toEqual([]);
  });
});
