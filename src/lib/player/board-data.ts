import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPublicPhotos,
  loadPublishedRounds,
  loadRoundResults,
  type PublicRoundSummary,
} from "@/lib/data/public-results";
import type { Database } from "@/lib/supabase/types";
import type { LiveBoardPayload, LiveBoardRow } from "./ranks";

/**
 * The player's leaderboard reads.
 *
 * A player sees only what the club has published, exactly like the public page. "Live" therefore
 * means the desk's latest published version, not the desk's working board: a correction that has
 * not been published never appears here, and neither does an unpublished pairing.
 */
export async function playerRounds(
  client: SupabaseClient<Database>,
): Promise<PublicRoundSummary[]> {
  return loadPublishedRounds(client);
}

export async function playerBoard(
  client: SupabaseClient<Database>,
  round: PublicRoundSummary,
): Promise<LiveBoardPayload | null> {
  const board = await loadRoundResults(client, round);
  if (!board) return null;

  // Net is the competition the club runs; a gross-only publication still has a board.
  const rows = board.net.length > 0 ? board.net : board.gross;
  const ids = rows
    .map((row) => row.playerId)
    .filter((id): id is string => id !== null && id !== "");

  let photos: Record<string, string> = {};
  try {
    photos = await loadPublicPhotos(client, ids, round.tournamentId);
  } catch {
    // A photo is a nicety; the board is not.
    photos = {};
  }

  return {
    roundId: round.roundId,
    eventName: round.eventName,
    dayNumber: round.dayNumber,
    playDate: round.playDate,
    version: round.version,
    state: round.state,
    publishedAt: round.publishedAt,
    rows: rows.map(
      (row): LiveBoardRow => ({
        playerId: row.playerId,
        playerName: row.playerName,
        flightName: row.flightName,
        points: row.points,
        strokes: row.strokes,
        holesCounted: row.holesCounted,
        holesTotal: row.holesTotal,
        photoPath: row.playerId ? (photos[row.playerId] ?? null) : null,
      }),
    ),
  };
}
