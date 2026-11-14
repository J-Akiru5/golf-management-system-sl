import { describe, expect, it } from "vitest";
import { TEST_COURSE, TEST_TEE } from "./__tests__/fixtures";
import {
  BAMBOO_TEE_2026_RULES,
  CARD_HANDICAP_SOURCE,
  cardHandicapSnapshot,
  eventRulesFor,
  readCardHandicap,
} from "./event-rules";
import { scoreRound } from "./stableford";
import { handicapSnapshotProblems } from "./validation";

const rule = BAMBOO_TEE_2026_RULES.handicap;

function playing(raw: string | number | null | undefined): number {
  const reading = readCardHandicap(raw, rule);
  if (!reading.ok) throw new Error(reading.message);
  return reading.playingHandicap;
}

describe("the card handicap rule", () => {
  it("drops the decimal instead of rounding", () => {
    expect(playing("16.7")).toBe(16);
    expect(playing("16.1")).toBe(16);
    expect(playing("16.99")).toBe(16);
    expect(playing("0.9")).toBe(0);
    expect(playing(30.5)).toBe(30);
  });

  it("keeps a whole number as written", () => {
    expect(playing("18")).toBe(18);
    expect(playing("0")).toBe(0);
    expect(playing("054")).toBe(54);
  });

  it("counts a blank box as 0", () => {
    for (const blank of ["", "   ", null, undefined]) {
      const reading = readCardHandicap(blank, rule);
      expect(reading).toEqual({ ok: true, cardValue: null, blank: true, playingHandicap: 0 });
    }
  });

  it("refuses what the rule does not cover instead of guessing", () => {
    for (const text of ["+2.1", "-1", "abc", "16,7", "16.", ".5", "1 6", "16.7.1", "NaN"]) {
      const reading = readCardHandicap(text, rule);
      expect(reading.ok, text).toBe(false);
    }
    const above = readCardHandicap("54.1", rule);
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.message).toContain("above the limit");
  });

  it("takes the blank value from the rule, not from the code", () => {
    const reading = readCardHandicap("", { source: "card", blankPlayingHandicap: 36 });
    expect(reading).toMatchObject({ ok: true, playingHandicap: 36 });
  });
});

describe("the event rule sets", () => {
  it("finds a round's rules by its rules version and ignores case and spaces", () => {
    expect(eventRulesFor("bamboo-tee-2026")).toBe(BAMBOO_TEE_2026_RULES);
    expect(eventRulesFor("  Bamboo-Tee-2026 ")).toBe(BAMBOO_TEE_2026_RULES);
  });

  it("returns null for any other rules version so those rounds keep the ordinary path", () => {
    expect(eventRulesFor("demo-rules-v1")).toBeNull();
    expect(eventRulesFor("")).toBeNull();
    expect(eventRulesFor(null)).toBeNull();
    expect(eventRulesFor(undefined)).toBeNull();
  });

  it("asks for one desk-checked card", () => {
    expect(BAMBOO_TEE_2026_RULES.requiredCards).toBe(1);
  });
});

describe("the card handicap snapshot", () => {
  function snapshotFor(raw: string | null) {
    const reading = readCardHandicap(raw, rule);
    if (!reading.ok) throw new Error(reading.message);
    return cardHandicapSnapshot({
      reading,
      rules: BAMBOO_TEE_2026_RULES,
      tee: TEST_TEE,
      effectiveDate: "2026-11-14",
    });
  }

  it("stores the same whole number as course and playing handicap", () => {
    const snapshot = snapshotFor("16.7");
    expect(snapshot).toMatchObject({
      index: 16.7,
      indexSource: CARD_HANDICAP_SOURCE,
      rounding: "card",
      allowance: 1,
      courseHandicap: 16,
      playingHandicap: 16,
      rulesVersion: "bamboo-tee-2026",
    });
    expect(handicapSnapshotProblems(snapshot)).toEqual([]);
  });

  it("cuts the index to one decimal without moving it across a whole number", () => {
    const snapshot = snapshotFor("16.97");
    expect(snapshot.index).toBe(16.9);
    expect(snapshot.playingHandicap).toBe(16);
    expect(handicapSnapshotProblems(snapshot)).toEqual([]);
  });

  it("is a 0 index and 0 handicap when the box is blank", () => {
    const snapshot = snapshotFor("");
    expect(snapshot).toMatchObject({ index: 0, courseHandicap: 0, playingHandicap: 0 });
    expect(handicapSnapshotProblems(snapshot)).toEqual([]);
  });

  it("is checked on its own terms, so a doctored playing handicap is still caught", () => {
    const snapshot = { ...snapshotFor("16.7"), playingHandicap: 17, courseHandicap: 17 };
    expect(handicapSnapshotProblems(snapshot).join(" ")).toContain("decimal dropped");
  });

  it("lets the engine calculate net points instead of flagging a mismatch", () => {
    const result = scoreRound({
      course: TEST_COURSE,
      scores: TEST_COURSE.holes.map((hole) => ({ hole: hole.number, grossStrokes: hole.par })),
      handicap: snapshotFor("16.7"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.result.netStatus).toBe("calculated");
    // Par on every hole off 16: 2 points on the two holes with no stroke (stroke index 17 and 18)
    // and 3 on the sixteen holes that receive one.
    expect(result.result.netPoints).toBe(2 * 2 + 16 * 3);
  });
});
