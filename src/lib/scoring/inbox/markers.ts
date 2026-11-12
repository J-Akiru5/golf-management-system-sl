/**
 * Marker candidates for a scanned card.
 *
 * By D6, amended, the marker is a player from the other team in the same group and the app assigns
 * it. Nobody has to pick or type it, and the name signed on the card is not used. The desk can still
 * change the marker after the app fills it in.
 *
 * The app only fills a candidate whose team is known, and only by position in the group: one
 * candidate is assigned as it is, several are assigned by the lowest position. A team or a position
 * that is not recorded is never guessed, so the app then fills nothing and leaves the choice to the
 * desk. A candidate whose team is not known is kept and flagged so the desk can check it.
 *
 * Pure: no I/O.
 */

export interface MarkerPoolPlayer {
  playerId: string;
  name: string;
  group: string | null;
  teamId: string | null;
  /** The player's place in the group, 1 for the first. Absent or null means unknown. */
  position?: number | null;
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
  /** The marker the app fills in, or null when it fills nothing and the desk must choose. */
  assignedMarkerId: string | null;
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

function knownPosition(position: number | null | undefined): number | null {
  return typeof position === "number" && Number.isFinite(position) ? position : null;
}

/**
 * The marker the app fills in, from the known other-team candidates only.
 *
 * One candidate is assigned as it is. Several are assigned by the lowest position in the group, with
 * a tie broken by player id. Anything else, including a missing position, assigns nobody.
 */
function assignMarker(
  knownTeam: readonly { playerId: string; position: number | null }[],
): string | null {
  const [only] = knownTeam;
  if (knownTeam.length === 1 && only !== undefined) {
    return only.playerId;
  }

  let best: { playerId: string; position: number } | null = null;
  for (const candidate of knownTeam) {
    if (candidate.position === null) {
      return null;
    }
    if (
      best === null ||
      candidate.position < best.position ||
      (candidate.position === best.position && compareText(candidate.playerId, best.playerId) < 0)
    ) {
      best = { playerId: candidate.playerId, position: candidate.position };
    }
  }
  return best === null ? null : best.playerId;
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
      assignedMarkerId: null,
      reason: "player_not_found",
      message: "That player is not in the list for this round.",
    };
  }

  const group = (player.group ?? "").trim();
  if (group === "") {
    return {
      candidates: [],
      assignedMarkerId: null,
      reason: "no_group",
      message: "This player has no group, so there is no other team to pick a marker from.",
    };
  }

  const candidates: MarkerCandidate[] = [];
  const knownTeam: { playerId: string; position: number | null }[] = [];
  for (const other of players) {
    if (other.playerId === player.playerId) continue;
    if ((other.group ?? "").trim() !== group) continue;

    const sameKnownTeam =
      player.teamId !== null && other.teamId !== null && player.teamId === other.teamId;
    if (sameKnownTeam) continue;

    const teamKnown = player.teamId !== null && other.teamId !== null;
    candidates.push({
      playerId: other.playerId,
      name: other.name,
      teamKnown,
    });
    if (teamKnown) {
      knownTeam.push({ playerId: other.playerId, position: knownPosition(other.position) });
    }
  }

  candidates.sort((left, right) => {
    if (left.teamKnown !== right.teamKnown) return left.teamKnown ? -1 : 1;
    return compareText(left.name, right.name) || compareText(left.playerId, right.playerId);
  });

  if (candidates.length === 0) {
    return {
      candidates: [],
      assignedMarkerId: null,
      reason: "no_candidates",
      message: "No player from another team in this group can be the marker.",
    };
  }

  return {
    candidates,
    assignedMarkerId: assignMarker(knownTeam),
    reason: null,
    message: "Players from the other team in the same group.",
  };
}
