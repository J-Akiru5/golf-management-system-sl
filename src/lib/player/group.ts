import { displayName } from "@/lib/format";

/** The part of a published group this helper reads. The snapshot stores names in order. */
export interface PublishedGroupShape {
  startHole: number;
  time: string;
  players: readonly string[];
}

/**
 * The other players in the published group, found from the frozen pairings snapshot.
 *
 * The portal returns the player's own start but not the group around them. The public pairings
 * already carry the allow-listed group list, so the home page reads it and matches on the start
 * time and hole, then on the player's name. If anything does not line up it returns nothing rather
 * than showing a stranger's fourball.
 */
export function groupMates(
  groups: readonly PublishedGroupShape[],
  player: { name: string; time: string | null; hole: number | null },
): string[] {
  if (!player.time || player.hole === null) return [];
  const candidates = groups.filter(
    (group) => group.time === player.time && group.startHole === player.hole,
  );
  const wanted = displayName(player.name);
  const own =
    candidates.find((group) =>
      group.players.some((name) => displayName(name) === wanted),
    ) ?? candidates[0];
  if (!own) return [];
  return own.players
    .filter((name) => displayName(name) !== wanted)
    .map((name) => displayName(name));
}
