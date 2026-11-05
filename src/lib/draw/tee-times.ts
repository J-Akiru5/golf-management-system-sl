import type { DrawGroup } from "./validate";

/** What one player takes from the draw: their group's wave time, hole and wave letter. */
export interface DrawTeeTime {
  teeTime: string;
  wave: string | null;
  startHole: number;
  groupNumber: number;
}

/**
 * The tee time each player takes from the draw, keyed by player id.
 *
 * A wave is the interval a flight goes off in, so the group's own time is the player's time: no
 * clock is read here and nothing is spread out. A player the board lists twice keeps the first
 * group's time; the draw flags the duplicate separately, so this never hides it.
 */
export function teeTimesFromDraw(draw: readonly DrawGroup[]): Map<string, DrawTeeTime> {
  const out = new Map<string, DrawTeeTime>();
  for (const group of draw) {
    for (const playerId of group.playerIds) {
      if (out.has(playerId)) continue;
      out.set(playerId, {
        teeTime: group.time,
        wave: group.wave,
        startHole: group.startHole,
        groupNumber: group.number,
      });
    }
  }
  return out;
}
