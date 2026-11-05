import type { DrawGroup } from "./validate";

/** Where the draw put a player: the wave they go off in, their hole and their group. */
export interface DrawPlacement {
  wave: string | null;
  startHole: number;
  groupNumber: number;
}

/**
 * The wave and start hole each player takes from the draw, keyed by player id.
 *
 * Only the draw's own facts are copied. The clock time is not: a player's time is their day's
 * session start moved by the wave interval, so an afternoon player stays in the afternoon. A player
 * the board lists twice keeps the first group's placement; the draw flags the duplicate separately,
 * so this never hides it.
 */
export function placementsFromDraw(draw: readonly DrawGroup[]): Map<string, DrawPlacement> {
  const out = new Map<string, DrawPlacement>();
  for (const group of draw) {
    for (const playerId of group.playerIds) {
      if (out.has(playerId)) continue;
      out.set(playerId, {
        wave: group.wave,
        startHole: group.startHole,
        groupNumber: group.number,
      });
    }
  }
  return out;
}
