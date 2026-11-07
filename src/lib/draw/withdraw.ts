import type { DrawGroup } from "./validate";

/** Where a player sat on the board before a withdrawal took them off it. */
export interface GroupPlacement {
  groupNumber: number;
  index: number;
}

/** The group a player is on, and their position in its roster. Null when they are not drawn. */
export function placementOf(draw: readonly DrawGroup[], playerId: string): GroupPlacement | null {
  for (const group of draw) {
    const index = group.playerIds.indexOf(playerId);
    if (index >= 0) return { groupNumber: group.number, index };
  }
  return null;
}

/**
 * Takes one player off the board. The group and its slot stay: a withdrawal leaves a place open in
 * the group, it does not re-cut the draw or move anyone else.
 */
export function removePlayerFromDraw(draw: DrawGroup[], playerId: string): DrawGroup[] {
  if (placementOf(draw, playerId) === null) return draw;
  return draw.map((group) =>
    group.playerIds.includes(playerId)
      ? { ...group, playerIds: group.playerIds.filter((id) => id !== playerId) }
      : group,
  );
}

/**
 * Puts a player back where they were. Nothing is guessed: if the player is already on the board, or
 * their group no longer exists, the board is returned unchanged so the caller can tell the truth
 * instead of inventing a place.
 */
export function restorePlayerToDraw(
  draw: DrawGroup[],
  playerId: string,
  placement: GroupPlacement,
): DrawGroup[] {
  if (placementOf(draw, playerId) !== null) return draw;
  const group = draw.find((candidate) => candidate.number === placement.groupNumber);
  if (!group) return draw;
  const index = Math.max(0, Math.min(placement.index, group.playerIds.length));
  return draw.map((candidate) =>
    candidate.number === placement.groupNumber
      ? {
          ...candidate,
          playerIds: [
            ...candidate.playerIds.slice(0, index),
            playerId,
            ...candidate.playerIds.slice(index),
          ],
        }
      : candidate,
  );
}
