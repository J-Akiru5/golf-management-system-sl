import { DEMO_SCORING_HOLES } from "@/lib/demo/scoring";
import type { PortalScorecard, PortalScorecardHole } from "./portal";

/**
 * The sample card the demo build shows on My card.
 *
 * It reads the demo layout's own pars and stroke indexes, which are placeholders rather than IGCC's
 * card, and scores them the way a player would: a bogey here, a birdie there, one handicap stroke on
 * the thirteen hardest holes. The page says the whole card is a sample.
 */
const PLAYING_HANDICAP = 13;

const OFFSETS = [0, 1, -1, 0, 1, 0, 0, 1] as const;

export function demoScorecard(): PortalScorecard {
  const holes: PortalScorecardHole[] = DEMO_SCORING_HOLES.map(({ number, par, strokeIndex }) => {
    const handicapStrokes = strokeIndex <= PLAYING_HANDICAP ? 1 : 0;
    const grossStrokes = par + (OFFSETS[number % OFFSETS.length] ?? 0);
    const netStrokes = grossStrokes - handicapStrokes;
    return {
      hole: number,
      par,
      strokeIndex,
      grossStrokes,
      handicapStrokes,
      netStrokes,
      grossPoints: 2 + (par - grossStrokes),
      netPoints: 2 + (par - netStrokes),
    };
  });

  const total = (pick: (hole: PortalScorecardHole) => number | null) =>
    holes.reduce((sum, hole) => sum + (pick(hole) ?? 0), 0);

  return {
    roundId: "demo-round-1",
    dayNumber: 1,
    playDate: "2026-11-12",
    state: "final",
    version: 1,
    publishedAt: "2026-11-12T10:30:00Z",
    playingHandicap: PLAYING_HANDICAP,
    courseHandicap: PLAYING_HANDICAP + 1,
    grossStrokes: total((hole) => hole.grossStrokes),
    netStrokes: total((hole) => hole.netStrokes),
    grossPoints: total((hole) => hole.grossPoints),
    netPoints: total((hole) => hole.netPoints),
    holesCounted: holes.length,
    holesTotal: 18,
    holes,
  };
}
