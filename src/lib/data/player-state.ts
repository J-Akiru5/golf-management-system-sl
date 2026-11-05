/** The two flags that say whether the club still uses a player record. */
export interface PlayerState {
  /** False when the club disabled the record. Absent means active. */
  active?: boolean;
  /** ISO timestamp of a soft delete. Null or absent while the player is in use. */
  deletedAt?: string | null;
}

/**
 * True when the record must not be used: a soft-deleted player, or one the club disabled.
 *
 * A removed player keeps their record, their handicap history and their registrations, which is what
 * makes the removal cheap to undo. What changes is that the desk stops offering them: they are not
 * read into the draw and the directory leaves them out unless the Removed filter is chosen.
 */
export function isPlayerRemoved(player: PlayerState): boolean {
  return player.deletedAt != null || player.active === false;
}

/** The words the desk reads beside a player. */
export function playerStateLabel(player: PlayerState): "Active" | "Disabled" | "Removed" {
  if (player.deletedAt != null) return "Removed";
  return player.active === false ? "Disabled" : "Active";
}
