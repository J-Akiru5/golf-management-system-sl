import { calculateHandicap } from "../handicap";
import type {
  CardEntry,
  HandicapSnapshot,
  HoleDefinition,
  HoleScore,
  RoundCourse,
  Scorecard,
  TeeRatings,
  VerificationPolicy,
} from "../types";

/** Test fixtures. Nothing in this folder is imported by the app. */

export const TEST_TEE: TeeRatings = {
  id: "white",
  name: "White",
  courseRating: 71.5,
  slope: 128,
  par: 72,
};

export const TEST_HOLES: HoleDefinition[] = [
  { number: 1, par: 4, strokeIndex: 9 },
  { number: 2, par: 4, strokeIndex: 3 },
  { number: 3, par: 3, strokeIndex: 15 },
  { number: 4, par: 5, strokeIndex: 1 },
  { number: 5, par: 4, strokeIndex: 11 },
  { number: 6, par: 4, strokeIndex: 7 },
  { number: 7, par: 3, strokeIndex: 17 },
  { number: 8, par: 5, strokeIndex: 5 },
  { number: 9, par: 4, strokeIndex: 13 },
  { number: 10, par: 4, strokeIndex: 10 },
  { number: 11, par: 4, strokeIndex: 4 },
  { number: 12, par: 3, strokeIndex: 16 },
  { number: 13, par: 5, strokeIndex: 2 },
  { number: 14, par: 4, strokeIndex: 12 },
  { number: 15, par: 4, strokeIndex: 8 },
  { number: 16, par: 3, strokeIndex: 18 },
  { number: 17, par: 5, strokeIndex: 6 },
  { number: 18, par: 4, strokeIndex: 14 },
];

export const TEST_COURSE: RoundCourse = {
  roundId: "round-1",
  tee: TEST_TEE,
  holes: TEST_HOLES,
};

export const TEST_POLICY: VerificationPolicy = {
  requiredCards: 2,
  allowProvisionalSingleCard: true,
  minOcrConfidence: 0.85,
};

let cardSequence = 0;

export function parScores(): HoleScore[] {
  return TEST_HOLES.map((hole) => ({ hole: hole.number, grossStrokes: hole.par }));
}

export function scoreAll(strokes: number): HoleScore[] {
  return TEST_HOLES.map((hole) => ({ hole: hole.number, grossStrokes: strokes }));
}

export function parEntries(): CardEntry[] {
  return TEST_HOLES.map((hole) => ({
    hole: hole.number,
    strokes: hole.par,
    confidence: null,
    manuallyConfirmed: true,
  }));
}

export function makeCard(overrides: Partial<Scorecard> = {}): Scorecard {
  cardSequence += 1;
  return {
    id: `card-${cardSequence}`,
    roundId: "round-1",
    playerId: "player-1",
    scorerId: `scorer-${cardSequence}`,
    source: "manual",
    revision: 1,
    status: "approved",
    entries: parEntries(),
    writtenTotal: 72,
    submittedAt: "2026-11-14T09:00:00.000Z",
    ...overrides,
  };
}

export function makeSnapshot(overrides: Partial<HandicapSnapshot> = {}): HandicapSnapshot {
  const calculated = calculateHandicap({
    index: 14.2,
    indexSource: "NGAP export 2026-11",
    indexEffectiveDate: "2026-11-01",
    tee: TEST_TEE,
    allowance: 1,
    rounding: "whs",
    rulesVersion: "test-rules-v1",
  });
  if (!calculated.ok) throw new Error("Test handicap fixture is invalid.");
  return { ...calculated.snapshot, ...overrides };
}

export function makeSnapshotFor(index: number, overrides: Partial<HandicapSnapshot> = {}) {
  const calculated = calculateHandicap({
    index,
    indexSource: "NGAP export 2026-11",
    indexEffectiveDate: "2026-11-01",
    tee: TEST_TEE,
    allowance: 1,
    rounding: "whs",
    rulesVersion: "test-rules-v1",
  });
  if (!calculated.ok) throw new Error("Test handicap fixture is invalid.");
  return { ...calculated.snapshot, ...overrides };
}
