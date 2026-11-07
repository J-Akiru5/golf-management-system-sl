/**
 * Where the draw put a player: the time their group starts, the hole it starts on, and the group
 * number. There is no wave: a session may have more than one start time, and the time is the fact
 * the desk and the tee-times screen both use.
 */
export interface DrawPlacement {
  time: string;
  startHole: number;
  groupNumber: number;
}

/**
 * The start time, hole and number each player takes from the draw, keyed by player id.
 *
 * Only the draw's own facts are copied. A player the board lists twice keeps the first group's
 * placement; the draw flags the duplicate separately, so this never hides it.
 */
export function placementsFromDraw(
  draw: readonly { time: string; startHole: number; number: number; playerIds: string[] }[],
): Map<string, DrawPlacement> {
  const out = new Map<string, DrawPlacement>();
  for (const group of draw) {
    for (const playerId of group.playerIds) {
      if (out.has(playerId)) continue;
      out.set(playerId, {
        time: group.time,
        startHole: group.startHole,
        groupNumber: group.number,
      });
    }
  }
  return out;
}
