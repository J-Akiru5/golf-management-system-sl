import { describe, expect, it } from "vitest";
import { calculateHandicap } from "../handicap";
import { scoreRound, stablefordPoints } from "../stableford";
import type { HandicapSnapshot, RoundCourse, TeeRatings } from "../types";
import { parScores, scoreAll, TEST_HOLES } from "./fixtures";

const FLAT_TEE: TeeRatings = {
  id: "white",
  name: "White",
  courseRating: 72,
  slope: 113,
  par: 72,
};

const FLAT_COURSE: RoundCourse = {
  roundId: "round-1",
  tee: FLAT_TEE,
  holes: TEST_HOLES,
};

function snapshotFor(index: number, allowance = 1): HandicapSnapshot {
  const result = calculateHandicap({
    index,
    indexSource: "NGAP export 2026-11",
    indexEffectiveDate: "2026-11-01",
    tee: FLAT_TEE,
    allowance,
    rounding: "whs",
    rulesVersion: "test-rules-v1",
  });
  if (!result.ok) throw new Error("Test snapshot is invalid.");
  return result.snapshot;
}

describe("Stableford points", () => {
  it("uses the conventional 0-5-or-more scale", () => {
    expect(stablefordPoints(4, 2)).toBe(4);
    expect(stablefordPoints(4, 3)).toBe(3);
    expect(stablefordPoints(4, 4)).toBe(2);
    expect(stablefordPoints(4, 5)).toBe(1);
    expect(stablefordPoints(4, 6)).toBe(0);
    expect(stablefordPoints(4, 9)).toBe(0);
    expect(stablefordPoints(3, 1)).toBe(4);
  });
});

describe("gross Stableford", () => {
  it("scores 18 par holes as 36 points and 72 strokes", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: parScores(),
      handicap: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.holesCompleted).toBe(18);
    expect(result.result.totalHoles).toBe(18);
    expect(result.result.grossStrokes).toBe(72);
    expect(result.result.grossPoints).toBe(36);
    expect(result.result.netStatus).toBe("unavailable");
    expect(result.result.netPoints).toBeNull();
  });

  it("does not let a plus handicap affect the gross board", () => {
    const plain = scoreRound({ course: FLAT_COURSE, scores: parScores(), handicap: null });
    const plus = scoreRound({
      course: FLAT_COURSE,
      scores: parScores(),
      handicap: snapshotFor(-2),
    });

    if (!plain.ok || !plus.ok) throw new Error("Expected both rounds to score.");
    expect(plus.result.grossPoints).toBe(plain.result.grossPoints);
    expect(plus.result.grossStrokes).toBe(plain.result.grossStrokes);
  });

  it("scores a partial round on the holes it was given", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: parScores().slice(0, 9),
      handicap: null,
      requireComplete: false,
    });

    if (!result.ok) throw new Error("Expected a partial round to score.");
    expect(result.result.holesCompleted).toBe(9);
    expect(result.result.totalHoles).toBe(18);
    expect(result.result.grossStrokes).toBe(36);
    expect(result.result.grossPoints).toBe(18);
  });

  it("refuses an incomplete round by default", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: parScores().slice(0, 17),
      handicap: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual([expect.objectContaining({ code: "missing_hole", hole: 18 })]);
  });
});

describe("net Stableford", () => {
  it("gives a full-handicap player one stroke on every hole", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: parScores(),
      handicap: snapshotFor(18),
    });

    if (!result.ok) throw new Error("Expected the round to score.");
    expect(result.result.netStatus).toBe("calculated");
    expect(result.result.netStrokes).toBe(54);
    expect(result.result.netPoints).toBe(54);
    expect(result.result.grossPoints).toBe(36);
  });

  it("allocates strokes by stroke index", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: scoreAll(5),
      handicap: snapshotFor(9),
    });

    if (!result.ok) throw new Error("Expected the round to score.");
    expect(result.result.grossPoints).toBe(18);
    expect(result.result.netPoints).toBe(27);
    expect(result.result.netStrokes).toBe(81);
  });

  it("gives strokes back from the easiest holes for a plus handicap", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: parScores(),
      handicap: snapshotFor(-2),
    });

    if (!result.ok) throw new Error("Expected the round to score.");
    expect(result.result.netPoints).toBe(34);
    expect(result.result.netStrokes).toBe(74);

    const easiest = result.result.holes.filter((hole) => hole.strokeIndex >= 17);
    expect(easiest.every((hole) => hole.handicapStrokes === -1)).toBe(true);
    expect(easiest.every((hole) => hole.netPoints === 1)).toBe(true);
  });

  it("keeps net unavailable when the snapshot came from another tee", () => {
    const otherTee: TeeRatings = {
      id: "red",
      name: "Red",
      courseRating: 70,
      slope: 120,
      par: 72,
    };

    const result = scoreRound({
      course: { ...FLAT_COURSE, tee: otherTee },
      scores: parScores(),
      handicap: snapshotFor(18),
    });

    if (!result.ok) throw new Error("Expected gross to survive a tee mismatch.");
    expect(result.result.netStatus).toBe("unavailable");
    expect(result.warnings).toEqual([expect.objectContaining({ code: "handicap_mismatch" })]);
  });

  it("keeps net unavailable when the stored snapshot does not add up", () => {
    const tampered = { ...snapshotFor(18), playingHandicap: 99 };
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: parScores(),
      handicap: tampered,
    });

    if (!result.ok) throw new Error("Expected gross to survive a bad snapshot.");
    expect(result.result.netStatus).toBe("unavailable");
    expect(result.result.netPoints).toBeNull();
    expect(result.warnings[0]?.code).toBe("handicap_mismatch");
  });

  it("keeps net unavailable when the snapshot's tee values are outside the course limits", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: parScores(),
      handicap: { ...snapshotFor(18), slope: 1 },
    });

    if (!result.ok) throw new Error("Expected gross to survive a bad snapshot.");
    expect(result.result.netStatus).toBe("unavailable");
    expect(result.warnings[0]?.code).toBe("handicap_mismatch");
  });
});

describe("pick-ups", () => {
  function withPickups(...holes: number[]) {
    return parScores().map((score) =>
      holes.includes(score.hole) ? { ...score, grossStrokes: 0, pickedUp: true } : score,
    );
  }

  it("scores 0 points on a pick-up and counts it as a completed hole", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: withPickups(5, 12),
      handicap: null,
    });

    if (!result.ok) throw new Error("Expected the round to score.");
    expect(result.result.holesCompleted).toBe(18);
    expect(result.result.pickups).toBe(2);
    expect(result.result.grossPoints).toBe(32);
    // Holes 5 (par 4) and 12 (par 3) add no strokes.
    expect(result.result.grossStrokes).toBe(65);
    expect(result.result.netStatus).toBe("unavailable");
    expect(result.result.netPoints).toBeNull();

    const pickup = result.result.holes.find((hole) => hole.hole === 5);
    expect(pickup).toMatchObject({
      pickedUp: true,
      grossStrokes: 0,
      netStrokes: null,
      grossPoints: 0,
      netPoints: null,
    });
  });

  it("gives a pick-up 0 net points when a handicap snapshot exists", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: withPickups(5, 12),
      handicap: snapshotFor(18),
    });

    if (!result.ok) throw new Error("Expected the round to score.");
    expect(result.result.netStatus).toBe("calculated");
    expect(result.result.pickups).toBe(2);
    expect(result.result.grossPoints).toBe(32);
    expect(result.result.grossStrokes).toBe(65);
    // 18 handicap: 3 points on each of the other 16 holes, plus 0 on each pick-up.
    expect(result.result.netPoints).toBe(48);
    // Those 16 holes received one stroke each; the pick-up adds no strokes.
    expect(result.result.netStrokes).toBe(49);

    const pickup = result.result.holes.find((hole) => hole.hole === 5);
    expect(pickup).toMatchObject({
      pickedUp: true,
      grossStrokes: 0,
      netStrokes: null,
      grossPoints: 0,
      netPoints: 0,
    });
  });

  it("gives exactly the old result when no hole is a pick-up", () => {
    const plain = scoreRound({ course: FLAT_COURSE, scores: parScores(), handicap: null });
    const marked = scoreRound({
      course: FLAT_COURSE,
      scores: parScores().map((score) => ({ ...score, pickedUp: false })),
      handicap: null,
    });

    if (!plain.ok || !marked.ok) throw new Error("Expected both rounds to score.");
    expect(marked.result).toEqual(plain.result);
    expect(plain.result.pickups).toBe(0);
    expect(plain.result.grossStrokes).toBe(72);
    expect(plain.result.grossPoints).toBe(36);
  });

  it("does not run the stroke limits on a pick-up", () => {
    const result = scoreRound({
      course: FLAT_COURSE,
      scores: parScores().map((score) =>
        score.hole === 1 ? { ...score, grossStrokes: 0, pickedUp: true } : score,
      ),
      handicap: null,
    });

    expect(result.ok).toBe(true);
  });
});

describe("score validation", () => {
  it("rejects impossible or duplicate hole scores", () => {
    const cases = [
      { scores: [{ hole: 1, grossStrokes: 0 }], code: "invalid_strokes" },
      { scores: [{ hole: 1, grossStrokes: 21 }], code: "invalid_strokes" },
      { scores: [{ hole: 1, grossStrokes: 2.5 }], code: "invalid_strokes" },
      {
        scores: [
          { hole: 1, grossStrokes: 4 },
          { hole: 1, grossStrokes: 5 },
        ],
        code: "duplicate_hole",
      },
      { scores: [{ hole: 19, grossStrokes: 4 }], code: "unknown_hole" },
    ];

    for (const testCase of cases) {
      const result = scoreRound({
        course: FLAT_COURSE,
        scores: testCase.scores,
        handicap: null,
        requireComplete: false,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.problems.some((problem) => problem.code === testCase.code)).toBe(true);
      }
    }
  });

  it("does not mutate its inputs", () => {
    const course = structuredClone(FLAT_COURSE);
    const scores = parScores();
    const before = JSON.stringify({ course, scores });

    scoreRound({ course, scores, handicap: snapshotFor(18) });

    expect(JSON.stringify({ course, scores })).toBe(before);
  });

  it("produces the same result on a retry", () => {
    const input = {
      course: FLAT_COURSE,
      scores: parScores(),
      handicap: snapshotFor(18),
    } as const;
    const first = scoreRound(input);
    const second = scoreRound(input);
    expect(second).toEqual(first);
  });
});
