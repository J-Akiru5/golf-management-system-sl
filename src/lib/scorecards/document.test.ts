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
});
