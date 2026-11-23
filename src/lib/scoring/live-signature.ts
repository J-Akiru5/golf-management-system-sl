import type { ScoringRoundView } from "@/lib/data/scoring";

/**
 * What identifies everything the scoring desk shows for one round, as one short string.
 *
 * The screens poll the round while the tab is visible, and this is how they decide whether anything
 * actually moved: a save by another desk user changes a card, an approval, a resolution or a
 * handicap snapshot, and every one of those leaves a different string. A poll that answers the same
 * signature changes nothing on screen, so a quiet round costs one read and no re-render.
 *
 * It deliberately carries no player data beyond what the screen already holds, and nothing here is
 * ever sent anywhere: the signature is compared in the browser and thrown away.
 *
 * Pure: no I/O, no clock.
 */
export function roundLiveSignature(view: ScoringRoundView | null): string {
  if (!view) return "none";
  return [
    view.roundId,
    view.roundStatus,
    view.provisionalPublication ? "1" : "0",
    view.requiredCards ?? "-",
    view.rulesVersion ?? "-",
    view.approvedBy ?? "-",
    view.publications.map((item) => `${item.version}:${item.state}:${item.publishedAt}`).join(","),
    view.cards
      .map(
        (card) =>
          `${card.id}:${card.playerId}:${card.scorerId}:${card.revision}:${card.status}:${card.submittedAt}:${card.writtenTotal ?? "-"}`,
      )
      .join(","),
    view.resolutions
      .map(
        (item) =>
          `${item.id}:${item.playerId}:${item.hole}:${item.strokes}:${item.pickedUp ? "x" : "-"}:${item.resolvedAt}`,
      )
      .join(","),
    view.players.map(playerLine).join(","),
  ].join("|");
}

/** One player: the snapshot the round is scored from, and the canonical holes it produced. */
function playerLine(player: ScoringRoundView["players"][number]): string {
  const handicap = player.handicap
    ? `${player.handicap.index}:${player.handicap.courseHandicap}:${player.handicap.playingHandicap}:${player.handicap.teeId}:${player.handicap.allowance}:${player.handicap.rounding}:${player.handicap.rulesVersion}`
    : "-";
  const holes = player.canonical.holes
    .map(
      (hole) =>
        `${hole.hole}${hole.status.slice(0, 1)}${hole.strokes ?? "-"}${hole.pickedUp ? "x" : ""}`,
    )
    .join(",");
  return [
    player.playerId,
    player.roundEntryId ?? "-",
    player.flightId ?? "-",
    player.flightName ?? "-",
    player.frozenIndex ?? "-",
    handicap,
    holes,
  ].join(":");
}
