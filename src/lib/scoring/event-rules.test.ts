import { describe, expect, it } from "vitest";
import { TEST_COURSE, TEST_TEE } from "./__tests__/fixtures";
import {
  BAMBOO_TEE_2026_RULES,
  cardBoxNote,
  EVENT_SCORING_RULE_SETS,
  eventHandicapSnapshot,
  eventPlayingHandicap,
  eventRulesFor,
  REGISTRATION_INDEX_SOURCE,
  readCardBox,
  ZERO_INDEX_WARNING,
} from "./event-rules";
import { scoreRound } from "./stableford";
import type { TeeRatings } from "./types";
import { handicapSnapshotProblems } from "./validation";

const rule = BAMBOO_TEE_2026_RULES.handicap;

function playing(index: number | null, tee: TeeRatings | null = TEST_TEE): number {
  const result = eventPlayingHandicap({ index, tee, rule });
  if (!result.ok) throw new Error(result.message);
  return result.playingHandicap;
}

function refusal(index: number | null, tee: TeeRatings | null) {
  const result = eventPlayingHandicap({ index, tee, rule });
  if (result.ok) throw new Error("The WHS figure was expected to be refused.");
  return result;
}

describe("the event handicap rule", () => {
  it("is the WHS figure for the index and the tee, not the card", () => {
    // 16.4 x (128 / 113) + (71.5 - 72) = 18.08, rounded half up to 18.
    expect(playing(16.4)).toBe(18);
    expect(playing(8.4)).toBe(9);
    expect(playing(30)).toBe(33);
  });

  it("is a whole number, rounded once at the end", () => {
    for (const index of [0, 3.3, 12.5, 16.7, 21.9, 30]) {
      expect(Number.isInteger(playing(index))).toBe(true);
    }
  });

  it("caps the index at the event maximum before converting it", () => {
    const capped = eventPlayingHandicap({ index: 34.2, tee: TEST_TEE, rule });
    if (!capped.ok) throw new Error(capped.message);
    expect(capped.index).toBe(30);
    expect(capped.onFile).toBe(34.2);
    expect(capped.capped).toBe(true);
    // 30 on this tee is 33, the same as an index of exactly 30, not the 34.2 figure.
    expect(capped.playingHandicap).toBe(playing(30));
  });

  it("takes the cap and the allowance from the rule, not from the code", () => {
    const result = eventPlayingHandicap({
      index: 40,
      tee: TEST_TEE,
      rule: { source: "whs", maxIndex: 18, allowance: 0.5 },
    });
    if (!result.ok) throw new Error(result.message);
    // Index 18 gives course handicap 20; half of it is 10.
    expect(result.courseHandicap).toBe(20);
    expect(result.playingHandicap).toBe(10);
  });

  it("plays an index of 0 off the WHS figure for 0 and flags it", () => {
    const result = eventPlayingHandicap({ index: 0, tee: TEST_TEE, rule });
    if (!result.ok) throw new Error(result.message);
    expect(result.playingHandicap).toBe(0);
    expect(result.zeroIndex).toBe(true);
    expect(result.warning).toBe(ZERO_INDEX_WARNING);
    expect(ZERO_INDEX_WARNING).toContain("check WHS");
  });

  it("treats no index on file the same way, and says so", () => {
    for (const index of [null, undefined]) {
      const result = eventPlayingHandicap({ index, tee: TEST_TEE, rule });
      if (!result.ok) throw new Error(result.message);
      expect(result.playingHandicap).toBe(0);
      expect(result.onFile).toBe(0);
      expect(result.warning).toBe(ZERO_INDEX_WARNING);
    }
  });

  it("gives a negative playing handicap when the tee rates below par", () => {
    // A White tee rated two under par: index 0 plays off -2, which is a real number on this course.
    const white: TeeRatings = { ...TEST_TEE, id: "white-ladies", courseRating: 70, par: 72 };
    expect(playing(0, white)).toBe(-2);
    expect(playing(10, white)).toBe(9);
  });

  it("refuses a player with no tee and says what to fix", () => {
    const missing = refusal(16.4, null);
    expect(missing.code).toBe("no_tee");
    expect(missing.message).toContain("no tee");
    expect(missing.message).toContain("field list");
  });

  it("refuses a tee whose ratings cannot be used", () => {
    const broken = refusal(16.4, { ...TEST_TEE, slope: 0 });
    expect(broken.code).toBe("invalid_tee");
    expect(broken.message).toContain("cannot be used");
  });

  it("refuses an index below the WHS range instead of converting it", () => {
    const below = refusal(-25, TEST_TEE);
    expect(below.code).toBe("invalid_index");
    expect(below.message).toContain("outside the WHS range");
  });

  it("refuses an allowance or a cap that is not usable", () => {
    const allowance = eventPlayingHandicap({
      index: 12,
      tee: TEST_TEE,
      rule: { source: "whs", maxIndex: 30, allowance: 0 },
    });
    expect(allowance.ok).toBe(false);
    if (!allowance.ok) expect(allowance.code).toBe("invalid_rule");
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

  it("asks for one desk-checked card, at the WHS handicap", () => {
    expect(BAMBOO_TEE_2026_RULES.requiredCards).toBe(1);
    expect(EVENT_SCORING_RULE_SETS).toContain(BAMBOO_TEE_2026_RULES);
    expect(BAMBOO_TEE_2026_RULES.handicap).toMatchObject({
      source: "whs",
      maxIndex: 30,
      allowance: 1,
    });
  });
});

describe("the HDCP box as a note", () => {
  it("reads a plain number and keeps what was typed", () => {
    expect(readCardBox(" 16.7 ")).toEqual({ text: "16.7", value: 16.7 });
    expect(readCardBox(22)).toEqual({ text: "22", value: 22 });
  });

  it("keeps a blank or unreadable box as text, without a number to compare", () => {
    for (const raw of ["", "   ", null, undefined, "+2.1", "abc", "16,7"]) {
      const box = readCardBox(raw);
      expect(box.value).toBeNull();
    }
    expect(readCardBox("+2.1").text).toBe("+2.1");
  });

  it("says nothing when the box agrees with the WHS number", () => {
    expect(
      cardBoxNote({
        box: readCardBox("18"),
        playingHandicap: 18,
        index: 16.4,
        teeName: TEST_TEE.name,
      }),
    ).toBeNull();
  });

  it("shows the box beside the WHS number when the two differ", () => {
    const note = cardBoxNote({
      box: readCardBox("22"),
      playingHandicap: 19,
      index: 16.4,
      teeName: "White",
    });
    expect(note).toBe("card says 22, plays off 19 (index 16.4, White)");
  });

  it("says nothing about a blank or unreadable box", () => {
    for (const box of [readCardBox(""), readCardBox("+2.1")]) {
      expect(cardBoxNote({ box, playingHandicap: 19, index: 16.4, teeName: "White" })).toBeNull();
    }
  });
});

describe("the event handicap snapshot", () => {
  function snapshotFor(index: number, overrides: TeeRatings = TEST_TEE) {
    const handicap = eventPlayingHandicap({ index, tee: overrides, rule });
    if (!handicap.ok) throw new Error(handicap.message);
    return eventHandicapSnapshot({
      handicap,
      rules: BAMBOO_TEE_2026_RULES,
      tee: overrides,
      effectiveDate: "2026-11-14",
    });
  }

  it("stores the registration index, the tee and the WHS handicaps", () => {
    const snapshot = snapshotFor(16.4);
    expect(snapshot).toMatchObject({
      index: 16.4,
      indexSource: REGISTRATION_INDEX_SOURCE,
      rounding: "whs",
      allowance: 1,
      teeId: TEST_TEE.id,
      courseHandicap: 18,
      playingHandicap: 18,
      rulesVersion: "bamboo-tee-2026",
    });
    expect(handicapSnapshotProblems(snapshot)).toEqual([]);
  });

  it("adds up for an index of 0", () => {
    const snapshot = snapshotFor(0);
    expect(snapshot).toMatchObject({ index: 0, courseHandicap: 0, playingHandicap: 0 });
    expect(handicapSnapshotProblems(snapshot)).toEqual([]);
  });

  it("is checked on its own terms, so a doctored playing handicap is still caught", () => {
    const snapshot = { ...snapshotFor(16.4), playingHandicap: 19 };
    expect(handicapSnapshotProblems(snapshot).join(" ")).toContain("Playing Handicap");
  });

  it("lets the engine calculate net points instead of flagging a mismatch", () => {
    const result = scoreRound({
      course: TEST_COURSE,
      scores: TEST_COURSE.holes.map((hole) => ({ hole: hole.number, grossStrokes: hole.par })),
      handicap: snapshotFor(16.4),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.result.netStatus).toBe("calculated");
    // Par on every hole off 18 is one stroke on each of the eighteen holes: 18 net birdies.
    expect(result.result.netPoints).toBe(18 * 3);
  });
});
