import { describe, expect, it } from "vitest";
import { normalizeSlug, validateScorecardPayload } from "./document";

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "PLAYER ONE",
    holes: Array.from({ length: 18 }, () => "4"),
    ...overrides,
  };
}

describe("normalizeSlug", () => {
  it("accepts a URL-safe scorecard key", () => {
    expect(normalizeSlug("day1am-r5")).toBe("day1am-r5");
  });

  it("refuses spaces and empty keys", () => {
    expect(normalizeSlug("day 1")).toBe("");
    expect(normalizeSlug("")).toBe("");
  });
});

describe("validateScorecardPayload", () => {
  it("accepts 18 numbers, X and blanks", () => {
    const holes = Array.from({ length: 18 }, (_, index) =>
      index === 0 ? "X" : index === 1 ? "" : "4",
    );
    const result = validateScorecardPayload({ cards: [card({ holes })] });
    expect(result.ok).toBe(true);
  });

  it("refuses a card without 18 holes", () => {
    const result = validateScorecardPayload({ cards: [card({ holes: ["4"] })] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("18 holes");
  });

  it("refuses an invalid score", () => {
    const holes = Array.from({ length: 18 }, () => "4");
    holes[6] = "21";
    const result = validateScorecardPayload({ cards: [card({ holes })] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("hole 7");
  });

  it("refuses a payload without cards", () => {
    const result = validateScorecardPayload({});
    expect(result.ok).toBe(false);
  });

  it("accepts every spelling of a blank hole that a scan or an older export uses", () => {
    const holes: unknown[] = Array.from({ length: 18 }, () => "4");
    holes[0] = 0;
    holes[1] = "0";
    holes[2] = null;
    holes[3] = "-";
    holes[4] = { v: "" };
    holes[5] = { v: "5" };
    holes[6] = "x";
    holes[7] = 6;
    const result = validateScorecardPayload({ cards: [card({ holes })] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const stored = (result.payload.cards as { holes: string[] }[])[0]?.holes;
      expect(stored?.slice(0, 8)).toEqual(["", "", "", "", "", "5", "X", "6"]);
      expect(stored?.every((hole) => typeof hole === "string")).toBe(true);
    }
  });

  it("names the card and the hole when a score is out of range", () => {
    const holes = Array.from({ length: 18 }, () => "4");
    holes[11] = "25";
    const result = validateScorecardPayload({ cards: [card({ name: "KIM, SO", holes })] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("KIM, SO");
      expect(result.message).toContain("hole 12");
    }
  });

  it("keeps the other fields on the page state", () => {
    const result = validateScorecardPayload({
      cards: [card()],
      mode: "whs",
      reviewBatches: [{ id: "batch-1" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.mode).toBe("whs");
      expect(result.payload.reviewBatches).toEqual([{ id: "batch-1" }]);
    }
  });

  it("accepts every playing day in one document, with no fixed card count", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => card({ id: `c${index}` }));
    expect(validateScorecardPayload({ cards: many(1200) }).ok).toBe(true);
  });
});
