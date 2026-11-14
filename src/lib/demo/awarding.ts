import { buildTeamLeaderboard } from "@/lib/data/public-team-leaderboard";
import { sampleTeamLeaderboardData } from "@/lib/demo/public-leaderboard";
import { buildAwardingBoards } from "@/lib/public/awarding";
import {
  type AwardingBoard,
  type LaneReveal,
  type LaneRevealMap,
  REVEAL_LANES,
  type RevealLaneId,
} from "@/lib/public/results-reveal";

/**
 * The awarding demo: fixed sample boards for all six lanes, and a counting-down release sequence so
 * the blank board, the cinema countdown and the flash can be rehearsed on a phone.
 *
 * Every name, class and score is the demo build's fictional sample data (see
 * `lib/demo/public-leaderboard.ts`), never a real player or a real result. Nothing here reads the
 * database, so the rehearsal works on a deployment that has not applied the awarding migration.
 *
 * The sequence is driven by the server's clock, not any device's, so two phones side by side count
 * down together. In a three-minute loop each lane holds, counts down for fifteen seconds, then shows
 * its board; Class A starts first and the gross overall board closes the loop.
 */

export const DEMO_CYCLE_SECONDS = 180;
/** How long one lane counts down before its board appears. */
export const DEMO_COUNTDOWN_SECONDS = 15;
/** How long after the previous lane starts counting the next lane starts. */
export const DEMO_LANE_OFFSET_SECONDS = 15;
/** The first lane starts counting this long after the loop begins, so the blank page is visible. */
export const DEMO_OPENING_SECONDS = 15;

/** The six sample boards, built from the demo field by the same code the desk uses. */
export function demoAwardingBoards(): Record<RevealLaneId, AwardingBoard> {
  return buildAwardingBoards(buildTeamLeaderboard(sampleTeamLeaderboardData()).teams);
}

/**
 * The lane states at one moment of the demo loop. Positions repeat every three minutes, so the
 * preview is always somewhere in the sequence and a reload never starts from a different place.
 */
export function demoLaneReveal(
  nowMs: number,
  boards: Record<RevealLaneId, AwardingBoard> = demoAwardingBoards(),
): LaneRevealMap {
  const seconds = Math.floor(nowMs / 1000);
  const elapsed = ((seconds % DEMO_CYCLE_SECONDS) + DEMO_CYCLE_SECONDS) % DEMO_CYCLE_SECONDS;
  const cycleStartMs = nowMs - elapsed * 1000;

  const lanes = {} as LaneRevealMap;
  for (const [index, lane] of REVEAL_LANES.entries()) {
    const startsAt = DEMO_OPENING_SECONDS + index * DEMO_LANE_OFFSET_SECONDS;
    const releasesAt = startsAt + DEMO_COUNTDOWN_SECONDS;
    const board = boards[lane.id] ?? [];
    const state: LaneReveal =
      elapsed >= releasesAt
        ? { state: "released", releaseAt: null, board }
        : {
            state: "held",
            // A held lane carries no board, the same way the database read withholds it.
            releaseAt:
              elapsed >= startsAt ? new Date(cycleStartMs + releasesAt * 1000).toISOString() : null,
            board: [],
          };
    lanes[lane.id] = state;
  }
  return lanes;
}
