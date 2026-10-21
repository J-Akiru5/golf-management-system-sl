import { describe, expect, it } from "vitest";
import { PROPOSED_SCORING_RULES, reciprocalRotation } from "../defaults";

describe("proposed scoring rules", () => {
  it("starts with two independent cards and allows a single-card provisional view", () => {
    expect(PROPOSED_SCORING_RULES.verification.requiredCards).toBe(2);
    expect(PROPOSED_SCORING_RULES.verification.allowProvisionalSingleCard).toBe(true);
    expect(PROPOSED_SCORING_RULES.provisionalPublication).toBe("verified_holes");
  });

  it("leaves the tie-break unconfirmed, so finalization remains blocked", () => {
    expect(PROPOSED_SCORING_RULES.tieBreak.confirmedBy).toBe("");
    expect(PROPOSED_SCORING_RULES.tieBreak.confirmedAt).toBe("");
    expect(PROPOSED_SCORING_RULES.tieBreak.source).toMatch(/proposed/i);
  });

  it("keeps the confirmed 100% allowance while naming the rounding mode", () => {
    expect(PROPOSED_SCORING_RULES.allowance).toBe(1);
    expect(PROPOSED_SCORING_RULES.rounding).toBe("whs");
  });

  it("keeps each day independent", () => {
    expect(PROPOSED_SCORING_RULES.multiDayEligibility).toBe("independent");
  });
});

describe("reciprocalRotation", () => {
  it("gives every player exactly one marker and never the player themself", () => {
    const rotation = reciprocalRotation(["a", "b", "c", "d"]);
    expect(rotation).toEqual([
      { playerId: "a", scorerId: "b" },
      { playerId: "b", scorerId: "c" },
      { playerId: "c", scorerId: "d" },
      { playerId: "d", scorerId: "a" },
    ]);
    expect(new Set(rotation.map((assignment) => assignment.playerId)).size).toBe(4);
    expect(rotation.every((assignment) => assignment.playerId !== assignment.scorerId)).toBe(true);
  });

  it("closes a two-player group reciprocally", () => {
    expect(reciprocalRotation(["a", "b"])).toEqual([
      { playerId: "a", scorerId: "b" },
      { playerId: "b", scorerId: "a" },
    ]);
  });

  it("returns nothing when a group is too small or the identities are blank", () => {
    expect(reciprocalRotation(["a"])).toEqual([]);
    expect(reciprocalRotation(["a", " "])).toEqual([]);
    expect(reciprocalRotation([])).toEqual([]);
  });
});
