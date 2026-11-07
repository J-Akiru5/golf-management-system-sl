import { describe, expect, it } from "vitest";
import { demoScorecard } from "./demo-card";

describe("demo scorecard", () => {
  it("has eighteen holes and a net score on each", () => {
    const card = demoScorecard();
    expect(card.holes).toHaveLength(18);
    for (const hole of card.holes) {
      expect(hole.netStrokes).toBe(hole.grossStrokes - (hole.handicapStrokes ?? 0));
    }
  });

  it("totals the card from its own holes", () => {
    const card = demoScorecard();
    expect(card.grossStrokes).toBe(card.holes.reduce((sum, hole) => sum + hole.grossStrokes, 0));
    expect(card.netPoints).toBe(card.holes.reduce((sum, hole) => sum + (hole.netPoints ?? 0), 0));
    expect(card.holesCounted).toBe(18);
  });
});
