import type { ScoringPlayerSeed, ScoringRoundSeed } from "@/lib/data/scoring";
import {
  calculateHandicap,
  type HoleDefinition,
  PROPOSED_SCORING_RULES,
  type RoundCourse,
  type TeeRatings,
} from "@/lib/scoring";

/**
 * A sample 18-hole course and four sample players for the scoring preview.
 *
 * The pars and stroke indexes are a plausible test layout, not IGCC's real card. The screen labels
 * the whole round as a sample and never writes it to the database.
 */

const LAYOUT: Array<[number, number, number]> = [
  [1, 4, 9],
  [2, 4, 3],
  [3, 3, 15],
  [4, 5, 1],
  [5, 4, 11],
  [6, 4, 7],
  [7, 3, 17],
  [8, 5, 5],
  [9, 4, 13],
  [10, 4, 10],
  [11, 4, 4],
  [12, 3, 16],
  [13, 5, 2],
  [14, 4, 12],
  [15, 4, 8],
  [16, 3, 18],
  [17, 5, 6],
  [18, 4, 14],
];

export const DEMO_SCORING_HOLES: HoleDefinition[] = LAYOUT.map(([number, par, strokeIndex]) => ({
  number,
  par,
  strokeIndex,
}));

export const DEMO_SCORING_TEE: TeeRatings = {
  id: "demo-white",
  name: "Sample White",
  courseRating: 72,
  slope: 113,
  par: 72,
};

export const DEMO_SCORING_COURSE: RoundCourse = {
  roundId: "demo-round-1",
  tee: DEMO_SCORING_TEE,
  holes: DEMO_SCORING_HOLES,
};

interface DemoPlayer {
  id: string;
  name: string;
  index: number;
}

const DEMO_PLAYERS: DemoPlayer[] = [
  { id: "demo-p1", name: "Sample Player A", index: 8.4 },
  { id: "demo-p2", name: "Sample Player B", index: 14.2 },
  { id: "demo-p3", name: "Sample Player C", index: 18.0 },
  { id: "demo-p4", name: "Sample Player D", index: 6.7 },
];

export function buildDemoScoringSeed(): ScoringRoundSeed {
  const players: ScoringPlayerSeed[] = DEMO_PLAYERS.map((player) => {
    const calculated = calculateHandicap({
      index: player.index,
      indexSource: "Demo index",
      indexEffectiveDate: "2026-11-01",
      tee: DEMO_SCORING_TEE,
      allowance: 1,
      rounding: "whs",
      rulesVersion: "demo-rules-v1",
    });
    return {
      registrationId: `demo-reg-${player.id}`,
      playerId: player.id,
      playerName: player.name,
      flightId: "demo-flight",
      handicap: calculated.ok ? calculated.snapshot : null,
    };
  });

  return {
    roundId: DEMO_SCORING_COURSE.roundId,
    tournamentId: "bamboo-tee-2026",
    course: DEMO_SCORING_COURSE,
    policy: PROPOSED_SCORING_RULES.verification,
    players,
    tieBreak: PROPOSED_SCORING_RULES.tieBreak,
    approvedBy: "demo-organizer",
    finalizationAuthority: PROPOSED_SCORING_RULES.finalizationAuthority,
    roundStatus: "scoring",
    provisionalPublication: true,
  };
}
