import { describe, expect, it } from "vitest";
import { makeSnapshot, TEST_COURSE, TEST_HOLES, TEST_TEE } from "./__tests__/fixtures";
import type { CardIssue, RoundCourse } from "./types";
import {
  type ScorecardReadinessInput,
  type ScorecardSummaryInput,
  scorecardReadiness,
  summariseScorecard,
} from "./workspace";

function parStrokes(): Record<number, string> {
  const values: Record<number, string> = {};
  for (const hole of TEST_HOLES) values[hole.number] = String(hole.par);
  return values;
}

function strokesWithout(...holes: number[]): Record<number, string> {
  const values = parStrokes();
  for (const hole of holes) delete values[hole];
  return values;
}

function frontNine(): Record<number, string> {
  const values = parStrokes();
  for (const hole of TEST_HOLES) {
    if (hole.number > 9) delete values[hole.number];
  }
  return values;
}

function backNine(): Record<number, string> {
  const values = parStrokes();
  for (const hole of TEST_HOLES) {
    if (hole.number <= 9) delete values[hole.number];
  }
  return values;
}

function readinessInput(overrides: Partial<ScorecardReadinessInput> = {}): ScorecardReadinessInput {
  return {
    playerId: "player-1",
    scorerId: "player-2",
    holes: TEST_HOLES,
    strokes: parStrokes(),
    ...overrides,
  };
}

function summaryInput(overrides: Partial<ScorecardSummaryInput> = {}): ScorecardSummaryInput {
  return {
    course: TEST_COURSE,
    strokes: parStrokes(),
    handicap: makeSnapshot(),
    ...overrides,
  };
}

const BLOCKING_ISSUE: CardIssue = {
  code: "wrong_round",
  severity: "blocking",
  hole: null,
  message: "The card belongs to a different daily round.",
};

const SECOND_BLOCKING_ISSUE: CardIssue = {
  code: "self_scored",
  severity: "blocking",
  hole: null,
  message: "A player cannot mark their own card.",
};

interface ReadinessCase {
  name: string;
  input: Partial<ScorecardReadinessInput>;
  ready: boolean;
  label: string;
  contains?: readonly string[];
}

const READINESS_CASES: readonly ReadinessCase[] = [
  {
    name: "is ready when the card is complete and a different player marks it",
    input: {},
    ready: true,
    label: "Ready to submit",
  },
  {
    name: "asks for a player before anything else",
    input: { playerId: "" },
    ready: false,
    label: "Choose a player",
    contains: ["Choose a player."],
  },
  {
    name: "treats a whitespace player as missing",
    input: { playerId: "   " },
    ready: false,
    label: "Choose a player",
  },
  {
    name: "asks for a marker",
    input: { scorerId: "" },
    ready: false,
    label: "Choose a different marker",
    contains: ["Choose a marker."],
  },
  {
    name: "refuses a player marking their own card",
    input: { scorerId: "player-1" },
    ready: false,
    label: "Choose a different marker",
    contains: ["cannot mark their own card"],
  },
  {
    name: "counts every blank hole",
    input: { strokes: strokesWithout(4, 12, 18) },
    ready: false,
    label: "Needs 3 holes",
    contains: ["Hole 4 has no score.", "Hole 12 has no score.", "Hole 18 has no score."],
  },
  {
    name: "uses a singular hole label",
    input: { strokes: strokesWithout(7) },
    ready: false,
    label: "Needs 1 hole",
  },
  {
    name: "counts a zero, a fraction, text and an out-of-range score as missing",
    input: { strokes: { ...parStrokes(), 2: "0", 5: "4.5", 9: "scratch", 14: "21" } },
    ready: false,
    label: "Needs 4 holes",
    contains: ["Hole 2 needs a whole-number score between 1 and 20."],
  },
  {
    name: "asks for a scan check",
    input: { reviews: { 4: "check" } },
    ready: false,
    label: "Check 1 hole",
    contains: ["Hole 4 needs a check against the paper card."],
  },
  {
    name: "counts a blank scan cell as a check",
    input: { reviews: { 4: "blank", 11: "blank" } },
    ready: false,
    label: "Check 2 holes",
    contains: ["Hole 4 was blank on the scan and needs a check."],
  },
  {
    name: "names missing holes before scan checks",
    input: { strokes: strokesWithout(2), reviews: { 3: "check" } },
    ready: false,
    label: "Needs 1 hole",
    contains: ["Hole 2 has no score.", "Hole 3 needs a check against the paper card."],
  },
  {
    name: "requires a reason when correcting a card",
    input: { correction: true },
    ready: false,
    label: "Add a correction reason",
    contains: ["Add a reason for the correction (at least 3 characters)."],
  },
  {
    name: "accepts a three-character correction reason",
    input: { correction: true, correctionReason: "fix" },
    ready: true,
    label: "Ready to submit",
  },
  {
    name: "ignores a reason on a card that is not a correction",
    input: { correctionReason: "fix" },
    ready: true,
    label: "Ready to submit",
  },
  {
    name: "blocks on a blocking card issue",
    input: { issues: [BLOCKING_ISSUE] },
    ready: false,
    label: "Resolve 1 issue",
    contains: ["The card belongs to a different daily round."],
  },
  {
    name: "counts every blocking card issue",
    input: { issues: [BLOCKING_ISSUE, SECOND_BLOCKING_ISSUE] },
    ready: false,
    label: "Resolve 2 issues",
  },
  {
    name: "does not block on warnings or review issues",
    input: {
      issues: [
        {
          code: "written_total_missing",
          severity: "warning",
          hole: null,
          message: "The card has no written total to check against.",
        },
        {
          code: "low_confidence",
          severity: "review",
          hole: 4,
          message: "Hole 4 needs a person to confirm it.",
        },
      ],
    },
    ready: true,
    label: "Ready to submit",
  },
  {
    name: "refuses a round with no holes",
    input: { holes: [] },
    ready: false,
    label: "Resolve 1 issue",
    contains: ["The round has no holes."],
  },
  {
    name: "keeps every blocker while the label names the first step",
    input: {
      strokes: strokesWithout(1),
      reviews: { 2: "blank" },
      correction: true,
      issues: [BLOCKING_ISSUE],
    },
    ready: false,
    label: "Needs 1 hole",
    contains: [
      "Hole 1 has no score.",
      "Hole 2 was blank on the scan and needs a check.",
      "The card belongs to a different daily round.",
      "Add a reason for the correction",
    ],
  },
];

describe("scorecardReadiness", () => {
  it.each(READINESS_CASES)("$name", ({ input, ready, label, contains }) => {
    const result = scorecardReadiness(readinessInput(input));

    expect(result.ready).toBe(ready);
    expect(result.label).toBe(label);
    if (contains) {
      const blockers = result.blockers.join(" ");
      for (const expected of contains) expect(blockers).toContain(expected);
    }
  });

  it("returns no blockers for a ready card", () => {
    expect(scorecardReadiness(readinessInput()).blockers).toEqual([]);
  });

  it("asks for a marker unless the event does not record one", () => {
    const missing = scorecardReadiness(readinessInput({ scorerId: "" }));
    expect(missing.ready).toBe(false);
    expect(missing.label).toBe("Choose a different marker");

    const optional = scorecardReadiness(readinessInput({ scorerId: "", markerRequired: false }));
    expect(optional.ready).toBe(true);
    expect(optional.blockers).toEqual([]);
  });

  it("still refuses a player marking their own card when the marker is optional", () => {
    const result = scorecardReadiness(
      readinessInput({ scorerId: "player-1", markerRequired: false }),
    );
    expect(result.ready).toBe(false);
    expect(result.label).toBe("Choose a different marker");
  });

  it("trims the correction reason before measuring it", () => {
    const short = scorecardReadiness(
      readinessInput({ correction: true, correctionReason: "  ab  " }),
    );
    expect(short.ready).toBe(false);
    expect(short.label).toBe("Add a correction reason");

    const enough = scorecardReadiness(
      readinessInput({ correction: true, correctionReason: "  fix  " }),
    );
    expect(enough.ready).toBe(true);
    expect(enough.label).toBe("Ready to submit");
  });
});

interface SummaryCase {
  name: string;
  input: Partial<ScorecardSummaryInput>;
  gross: number;
  out: number;
  back: number;
  holesEntered: number;
  grossPoints: number;
  netPoints: number | null;
  netStatus: "calculated" | "unavailable";
  writtenTotal: number | null;
  writtenMatches: boolean | null;
}

const SUMMARY_CASES: readonly SummaryCase[] = [
  {
    name: "totals a complete card at par and matches the written total",
    input: { writtenTotal: 72 },
    gross: 72,
    out: 36,
    back: 36,
    holesEntered: 18,
    grossPoints: 36,
    netPoints: 52,
    netStatus: "calculated",
    writtenTotal: 72,
    writtenMatches: true,
  },
  {
    name: "totals a partial front nine without inventing the back",
    input: { strokes: frontNine() },
    gross: 36,
    out: 36,
    back: 0,
    holesEntered: 9,
    grossPoints: 18,
    netPoints: 26,
    netStatus: "calculated",
    writtenTotal: null,
    writtenMatches: null,
  },
  {
    name: "totals a partial back nine in IN, not OUT",
    input: { strokes: backNine() },
    gross: 36,
    out: 0,
    back: 36,
    holesEntered: 9,
    grossPoints: 18,
    netPoints: 26,
    netStatus: "calculated",
    writtenTotal: null,
    writtenMatches: null,
  },
  {
    name: "totals one entered hole",
    input: { strokes: { 1: "4" } },
    gross: 4,
    out: 4,
    back: 0,
    holesEntered: 1,
    grossPoints: 2,
    netPoints: 3,
    netStatus: "calculated",
    writtenTotal: null,
    writtenMatches: null,
  },
  {
    name: "keeps gross but leaves net unavailable without a handicap",
    input: { handicap: null },
    gross: 72,
    out: 36,
    back: 36,
    holesEntered: 18,
    grossPoints: 36,
    netPoints: null,
    netStatus: "unavailable",
    writtenTotal: null,
    writtenMatches: null,
  },
  {
    name: "reports a written total that does not match the holes",
    input: { writtenTotal: 71 },
    gross: 72,
    out: 36,
    back: 36,
    holesEntered: 18,
    grossPoints: 36,
    netPoints: 52,
    netStatus: "calculated",
    writtenTotal: 71,
    writtenMatches: false,
  },
  {
    name: "does not compare a written total against an incomplete card",
    input: { strokes: frontNine(), writtenTotal: 36 },
    gross: 36,
    out: 36,
    back: 0,
    holesEntered: 9,
    grossPoints: 18,
    netPoints: 26,
    netStatus: "calculated",
    writtenTotal: 36,
    writtenMatches: null,
  },
  {
    name: "drops a written total that is not a positive whole number",
    input: { writtenTotal: 0 },
    gross: 72,
    out: 36,
    back: 36,
    holesEntered: 18,
    grossPoints: 36,
    netPoints: 52,
    netStatus: "calculated",
    writtenTotal: null,
    writtenMatches: null,
  },
  {
    name: "skips invalid cells and totals only the valid holes",
    // "XX" is unreadable text. A single X is a pick-up and is covered separately.
    input: { strokes: { 1: "4", 2: "XX", 3: "", 4: "4.5", 5: "25" } },
    gross: 4,
    out: 4,
    back: 0,
    holesEntered: 1,
    grossPoints: 2,
    netPoints: 3,
    netStatus: "calculated",
    writtenTotal: null,
    writtenMatches: null,
  },
];

describe("summariseScorecard", () => {
  it.each(SUMMARY_CASES)("$name", (testCase) => {
    const result = summariseScorecard(summaryInput(testCase.input));

    expect(result.gross).toBe(testCase.gross);
    expect(result.out).toBe(testCase.out);
    expect(result.in).toBe(testCase.back);
    expect(result.holesEntered).toBe(testCase.holesEntered);
    expect(result.grossPoints).toBe(testCase.grossPoints);
    expect(result.netPoints).toBe(testCase.netPoints);
    expect(result.netStatus).toBe(testCase.netStatus);
    expect(result.writtenTotal).toBe(testCase.writtenTotal);
    expect(result.writtenMatches).toBe(testCase.writtenMatches);
  });

  it("names invalid cells and leaves blank cells out of the problems", () => {
    const result = summariseScorecard(
      summaryInput({ strokes: { 1: "4", 2: "XX", 3: "", 4: "4.5", 5: "25" } }),
    );

    expect(result.problems).toEqual([
      "Hole 2 needs a whole-number score between 1 and 20.",
      "Hole 4 needs a whole-number score between 1 and 20.",
      "Hole 5 needs a whole-number score between 1 and 20.",
    ]);
  });

  it("does not report blank holes as problems", () => {
    const result = summariseScorecard(summaryInput({ strokes: frontNine() }));
    expect(result.problems).toEqual([]);
  });

  it("returns zeroed totals when the engine refuses the course", () => {
    const course: RoundCourse = { ...TEST_COURSE, tee: { ...TEST_TEE, par: 71 } };
    const result = summariseScorecard(summaryInput({ course, writtenTotal: 72 }));

    expect(result.gross).toBe(0);
    expect(result.out).toBe(0);
    expect(result.in).toBe(0);
    expect(result.holesEntered).toBe(0);
    expect(result.grossPoints).toBe(0);
    expect(result.netPoints).toBeNull();
    expect(result.netStatus).toBe("unavailable");
    expect(result.writtenTotal).toBe(72);
    expect(result.writtenMatches).toBeNull();
    expect(result.problems).toContain("The holes add up to par 72, but the tee par is 71.");
  });

  it("keeps net unavailable when the snapshot was taken on another tee", () => {
    const result = summariseScorecard(summaryInput({ handicap: makeSnapshot({ teeId: "blue" }) }));

    expect(result.gross).toBe(72);
    expect(result.netPoints).toBeNull();
    expect(result.netStatus).toBe("unavailable");
    expect(result.problems.join(" ")).toContain("different tee");
  });

  it("exposes the per-hole points and the points row the card prints", () => {
    const result = summariseScorecard(summaryInput());

    expect(result.pointsKind).toBe("net");
    expect(result.holes).toHaveLength(18);
    expect(result.holes[0]).toMatchObject({
      hole: 1,
      grossStrokes: 4,
      grossPoints: 2,
      netPoints: 3,
    });
    expect(result.outPoints).toBe(
      result.holes
        .filter((hole) => hole.hole <= 9)
        .reduce((sum, hole) => sum + (hole.netPoints ?? 0), 0),
    );
    expect(result.inPoints).toBe(
      result.holes
        .filter((hole) => hole.hole >= 10)
        .reduce((sum, hole) => sum + (hole.netPoints ?? 0), 0),
    );
  });

  it("prints gross points when there is no handicap", () => {
    const result = summariseScorecard(summaryInput({ handicap: null }));

    expect(result.pointsKind).toBe("gross");
    expect(result.holes).toHaveLength(18);
    expect(result.holes[0]?.grossPoints).toBe(2);
    expect(result.holes[0]?.netPoints).toBeNull();
    expect(result.outPoints).toBe(result.grossPoints - result.inPoints);
  });
});

describe("pick-ups in the workspace", () => {
  it("accepts X and x as filled holes that need nothing else", () => {
    const result = scorecardReadiness(
      readinessInput({ strokes: { ...parStrokes(), 1: "X", 10: "x" } }),
    );

    expect(result.ready).toBe(true);
    expect(result.label).toBe("Ready to submit");
    expect(result.blockers).toEqual([]);
  });

  it("still asks for a check when other text is unreadable", () => {
    const result = scorecardReadiness(readinessInput({ strokes: { ...parStrokes(), 1: "XX" } }));

    expect(result.ready).toBe(false);
    expect(result.label).toBe("Needs 1 hole");
    expect(result.blockers).toContain("Hole 1 needs a whole-number score between 1 and 20.");
  });

  it("counts pick-ups as filled, scores them 0 and leaves them out of the stroke totals", () => {
    const result = summariseScorecard(
      summaryInput({ strokes: { ...parStrokes(), 1: "X", 10: "x" }, writtenTotal: 64 }),
    );

    expect(result.holesEntered).toBe(18);
    expect(result.pickups).toBe(2);
    expect(result.gross).toBe(64);
    expect(result.out).toBe(32);
    expect(result.in).toBe(32);
    expect(result.grossPoints).toBe(32);
    // Holes 1 and 10 each lose the 3 net points they would have scored at par.
    expect(result.netPoints).toBe(46);
    expect(result.problems).toEqual([]);

    const pickup = result.holes.find((hole) => hole.hole === 1);
    expect(pickup).toMatchObject({
      pickedUp: true,
      grossStrokes: 0,
      grossPoints: 0,
      netStrokes: null,
      netPoints: 0,
    });
    expect(result.outPoints).toBe(
      result.holes
        .filter((hole) => hole.hole <= 9)
        .reduce((sum, hole) => sum + (hole.netPoints ?? 0), 0),
    );
  });

  it("does not compare a written total against a card with a pick-up", () => {
    const result = summariseScorecard(
      summaryInput({ strokes: { ...parStrokes(), 1: "X" }, writtenTotal: 68 }),
    );

    expect(result.writtenTotal).toBe(68);
    expect(result.writtenMatches).toBeNull();
  });
});
