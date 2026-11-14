import { describe, expect, it } from "vitest";
import { applyTeamClasses, averageIndex, teamClassValue } from "./classify";
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

describe("teamClassValue", () => {
  it("returns the number a pair is classed on, not either partner's own", () => {
    const members = [
      { index: 8, playingHandicap: 9 },
      { index: 18, playingHandicap: 20 },
    ];

    // 8 and 18 average 13, which is Class B, although the first is Class A on their own.
    expect(teamClassValue(members, "index", 30)).toBe(13);
  });

  it("counts an index above the event maximum as the maximum", () => {
    // 40 counts as 30, so the pair averages 22, not 27.
    expect(
      teamClassValue(
        [
          { index: 40, playingHandicap: 44 },
          { index: 14, playingHandicap: 15 },
        ],
        "index",
        30,
      ),
    ).toBe(22);
  });

  it("classes a player drawn alone on their own number", () => {
    expect(teamClassValue([{ index: 22, playingHandicap: 25 }], "index", 30)).toBe(22);
    expect(teamClassValue([{ index: 22, playingHandicap: 25 }], "courseHandicap", 30)).toBe(25);
  });

  it("uses the playing handicap when the event classes on the course handicap", () => {
    const members = [
      { index: 12, playingHandicap: 14 },
      { index: 20, playingHandicap: 23 },
    ];

    // The indexes average 16 (Class B). The playing handicaps average 18.5 (Class C).
    expect(teamClassValue(members, "index", 30)).toBe(16);
    expect(teamClassValue(members, "courseHandicap", 30)).toBe(18.5);
  });

  it("counts a blank number as 0, so a pair is never left without a class", () => {
    expect(
      teamClassValue(
        [
          { index: 20, playingHandicap: 22 },
          { index: null, playingHandicap: null },
        ],
        "index",
        30,
      ),
    ).toBe(10);
  });
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

  it("averages an index above the event maximum as the maximum", () => {
    const registrations = [reg("member", 40, "team-3"), reg("guest", 14, "team-3")];

    applyTeamClasses(registrations, flights, 30);

    // 40 counts as 30, so the pair averages 22 (Class C), not 27 (Class D) from the raw number.
    expect(registrations.map((r) => r.flightId)).toEqual(["c", "c"]);
    expect(registrations[0]?.reasons.join(" ")).toContain("average index 22");
    // The index on file is not rewritten.
    expect(registrations[0]?.index).toBe(40);
  });

  it("keeps the individual classes when the average covers no class", () => {
    const registrations = [reg("a", 31, "team-9"), reg("b", 32, "team-9")];

    applyTeamClasses(registrations, flights);

    expect(registrations.map((r) => r.flightId)).toEqual(["a", "a"]);
  });

  it("keeps a stored card class instead of re-cutting the pair average", () => {
    const member = reg("member", 0, "team-card");
    member.classSource = "stored";
    member.flightId = "c";
    const guest = reg("guest", 0, "team-card");
    guest.classSource = "stored";
    guest.flightId = "c";

    applyTeamClasses([member, guest], flights);

    expect([member.flightId, guest.flightId]).toEqual(["c", "c"]);
    expect([member.reasons, guest.reasons].flat().join(" ")).not.toContain("average index");
  });

  it("names a conflicting stored pair class instead of silently overwriting it", () => {
    const member = reg("member", 0, "team-card");
    member.classSource = "stored";
    member.flightId = "c";
    const guest = reg("guest", 0, "team-card");
    guest.classSource = "stored";
    guest.flightId = "a";

    applyTeamClasses([member, guest], flights);

    expect([member.flightId, guest.flightId]).toEqual(["c", "a"]);
    expect(member.reasons.join(" ")).toContain("differ");
    expect(guest.reasons.join(" ")).toContain("differ");
  });

  it("does not invent a pair class when the stored override names none", () => {
    const member = reg("member", 0, "team-empty");
    member.classSource = "stored";
    member.flightId = null;
    const guest = reg("guest", 14, "team-empty");
    guest.flightId = "b";

    applyTeamClasses([member, guest], flights, 30);

    expect(member.flightId).toBeNull();
    expect(guest.flightId).toBe("b");
    expect([member.reasons, guest.reasons].flat().join(" ")).not.toContain("average");
  });

  it("cuts the pair on the course handicap when the event classes on it", () => {
    const member = reg("member", 12, "team-ch");
    member.playingHandicap = 14;
    const guest = reg("guest", 20, "team-ch");
    guest.playingHandicap = 23;

    applyTeamClasses([member, guest], flights, 30, "courseHandicap");

    // The playing handicaps average 18.5, which is Class C; the indexes average 16, which is Class B.
    expect([member.flightId, guest.flightId]).toEqual(["c", "c"]);
    expect(member.reasons.join(" ")).toContain("average course handicap 18.5");
  });
});
