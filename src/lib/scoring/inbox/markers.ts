/**
 * Marker candidates for a scanned card.
 *
 * By D6 the marker is a player from the other team in the same group. The desk picks one; the name
 * signed on the card is only a suggestion elsewhere. A team that is not recorded is never guessed:
 * the candidate is kept and flagged so the desk can check it.
 *
 * Pure: no I/O.
 */

export interface MarkerPoolPlayer {
  playerId: string;
  name: string;
  group: string | null;
  teamId: string | null;
}

export interface MarkerCandidate {
  playerId: string;
  name: string;
  /** True only when both the player's team and this candidate's team are known. */
  teamKnown: boolean;
}

export type MarkerReasonCode = "no_group" | "no_candidates" | "player_not_found";

export interface MarkerCandidates {
  candidates: MarkerCandidate[];
  /** A stable code when no candidate can be offered, otherwise null. */
  reason: MarkerReasonCode | null;
  /** Plain words for the desk. */
  message: string;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * The players who may mark this player's card: same group, not the player, and not a known member
 * of the player's team. Known other-team candidates come first, then candidates whose team is not
 * fully known, each sorted by name.
 */
export function markerCandidates(
  playerId: string,
  players: readonly MarkerPoolPlayer[],
): MarkerCandidates {
  const player = players.find((candidate) => candidate.playerId === playerId);
  if (player === undefined) {
    return {
      candidates: [],
      reason: "player_not_found",
      message: "That player is not in the list for this round.",
    };
  }

  const group = (player.group ?? "").trim();
  if (group === "") {
    return {
      candidates: [],
      reason: "no_group",
      message: "This player has no group, so there is no other team to pick a marker from.",
    };
  }

  const candidates: MarkerCandidate[] = [];
  for (const other of players) {
    if (other.playerId === player.playerId) continue;
    if ((other.group ?? "").trim() !== group) continue;

    const sameKnownTeam =
      player.teamId !== null && other.teamId !== null && player.teamId === other.teamId;
    if (sameKnownTeam) continue;

    candidates.push({
      playerId: other.playerId,
      name: other.name,
      teamKnown: player.teamId !== null && other.teamId !== null,
    });
  }

  candidates.sort((left, right) => {
    if (left.teamKnown !== right.teamKnown) return left.teamKnown ? -1 : 1;
    return compareText(left.name, right.name) || compareText(left.playerId, right.playerId);
  });

  if (candidates.length === 0) {
    return {
      candidates: [],
      reason: "no_candidates",
      message: "No player from another team in this group can be the marker.",
    };
  }

  return {
    candidates,
    reason: null,
    message: "Players from the other team in the same group.",
  };
}
