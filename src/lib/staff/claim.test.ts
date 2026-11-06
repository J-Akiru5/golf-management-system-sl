import { describe, expect, it } from "vitest";
import { claimKey, claimMatches, type GroupClaim, parseClaim, serializeClaim } from "./claim";

const claim: GroupClaim = {
  tournamentId: "event-1",
  dayNumber: 3,
  groupId: "group-7",
  groupNumber: 7,
};

describe("group claim", () => {
  it("round-trips a claim", () => {
    expect(parseClaim(serializeClaim(claim))).toEqual(claim);
  });

  it("keeps the claim per event and day", () => {
    expect(claimKey("event-1", 3)).toBe("staff:claim:event-1:3");
    expect(claimKey("event-1", 4)).not.toBe(claimKey("event-1", 3));
  });

  it("matches only the event and day on screen", () => {
    expect(claimMatches(claim, "event-1", 3)).toBe(true);
    expect(claimMatches(claim, "event-1", 4)).toBe(false);
    expect(claimMatches(claim, "event-2", 3)).toBe(false);
    expect(claimMatches(null, "event-1", 3)).toBe(false);
  });

  it("treats a damaged claim as no claim", () => {
    expect(parseClaim(null)).toBeNull();
    expect(parseClaim("")).toBeNull();
    expect(parseClaim("not json")).toBeNull();
    expect(parseClaim("null")).toBeNull();
    expect(parseClaim(JSON.stringify({ ...claim, groupNumber: "7" }))).toBeNull();
    expect(parseClaim(JSON.stringify({ ...claim, groupId: "" }))).toBeNull();
    expect(parseClaim(JSON.stringify({ ...claim, dayNumber: 1.5 }))).toBeNull();
    expect(parseClaim(JSON.stringify({ ...claim, tournamentId: 42 }))).toBeNull();
  });
});
