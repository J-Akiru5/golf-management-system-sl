import { describe, expect, it } from "vitest";
import { applyTeamClasses, averageIndex } from "./classify";
import type { FlightRule, Registration } from "./types";

const flights: FlightRule[] = [
  { id: "a", categoryId: "regular", name: "Class A", min: 0, max: 12 },
  { id: "b", categoryId: "regular", name: "Class B", min: 12.1, max: 18 },
  { id: "c", categoryId: "regular", name: "Class C", min: 18.1, max: 23 },
  { id: "d", categoryId: "regular", name: "Class D", min: 23.1, max: 30 },
];

const reg = (playerId: string, index: number | null, teamKey: string | null): Registration => ({
  playerId,
  playerName: playerId,
  teamKey,
  status: "ok",
  reasons: [],
  index,
  age: 40,
  categoryId: "regular",
  teeId: "blue",
  playingHandicap: 0,
  flightId: "a",
});

describe("averageIndex", () => {
  it("averages the two indexes of a pair", () => {
    expect(averageIndex([10.4, 6])).toBe(8.2);
  });

  it("counts a blank index as 0 instead of leaving the pair without a class", () => {
    expect(averageIndex([20, null])).toBe(10);
  });
});

describe("applyTeamClasses", () => {
  it("puts both partners in the class of their average, not their own", () => {
    const registrations = [reg("member", 8, "team-1"), reg("guest", 18, "team-1")];

    applyTeamClasses(registrations, flights);

    // 8 and 18 average 13, which is Class B, although the member alone is Class A.
    expect(registrations.map((r) => r.flightId)).toEqual(["b", "b"]);
    expect(registrations[0]?.reasons.join(" ")).toContain("average index 13");
  });

  it("leaves a player drawn on their own in their own class", () => {
    const registrations = [reg("solo", 22, null)];

    applyTeamClasses(registrations, flights);

    expect(registrations[0]?.flightId).toBe("a");
  });

  it("keeps the individual classes when the average covers no class", () => {
    const registrations = [reg("a", 31, "team-9"), reg("b", 32, "team-9")];

    applyTeamClasses(registrations, flights);

    expect(registrations.map((r) => r.flightId)).toEqual(["a", "a"]);
  });
});
