import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/format";
import type { Database, Json } from "@/lib/supabase/types";

export interface PublicRoundSummary {
  roundId: string;
  tournamentId: string;
  eventName: string;
  dayNumber: number;
  playDate: string;
  version: number;
  state: "provisional" | "final";
  publishedAt: string;
}

export interface PublicResultRow {
  playerId: string | null;
  playerName: string;
  flightName: string | null;
  points: number;
  strokes: number | null;
  holesCounted: number;
  holesTotal: number;
  /** Public-bucket path, only for players with separate public consent. */
  photoPath: string | null;
}

export interface PublicLeaderboard {
  round: PublicRoundSummary;
  gross: PublicResultRow[];
  net: PublicResultRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resultRows(value: unknown): PublicResultRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row)) return [];
    const playerName = text(row.playerName);
    if (!playerName) return [];
    return [
      {
        playerId: text(row.playerId),
        playerName: displayName(playerName),
        flightName: text(row.flightName),
        points: count(row.points),
        strokes: typeof row.strokes === "number" ? row.strokes : null,
        holesCounted: count(row.holesCounted),
        holesTotal: count(row.holesTotal),
        photoPath: null,
      },
    ];
  });
}

/** Parses the frozen publication snapshot; old snapshots simply have no player ids. */
export function parsePublicLeaderboard(
  round: PublicRoundSummary,
  snapshot: Json,
): PublicLeaderboard {
  const value = isRecord(snapshot) ? snapshot : {};
  return {
    round,
    gross: resultRows(value.gross),
    net: resultRows(value.net),
  };
}

export async function loadPublishedRounds(
  client: SupabaseClient<Database>,
): Promise<PublicRoundSummary[]> {
  const { data, error } = await client.rpc("public_published_rounds");
  if (error) throw new Error(`Could not load published rounds: ${error.message}`);
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (!isRecord(row)) return [];
    const roundId = text(row.round_id);
    const tournamentId = text(row.tournament_id);
    const eventName = text(row.event_name);
    const playDate = text(row.play_date);
    const publishedAt = text(row.published_at);
    const state = text(row.state);
    if (!roundId || !tournamentId || !eventName || !playDate || !publishedAt) return [];
    if (state !== "provisional" && state !== "final") return [];
    return [
      {
        roundId,
        tournamentId,
        eventName,
        dayNumber: count(row.day_number),
        playDate,
        version: count(row.version),
        state,
        publishedAt,
      },
    ];
  });
}

export async function loadRoundResults(
  client: SupabaseClient<Database>,
  round: PublicRoundSummary,
): Promise<PublicLeaderboard | null> {
  const { data, error } = await client.rpc("public_round_results", { p_round: round.roundId });
  if (error) throw new Error(`Could not load the leaderboard: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) return null;
  return parsePublicLeaderboard(round, row.snapshot);
}

export async function loadPublicPhotos(
  client: SupabaseClient<Database>,
  playerIds: string[],
  tournamentId?: string | null,
): Promise<Record<string, string>> {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return {};

  // The event argument is what applies a photos hold. A database that has not applied the release
  // migration only has the one-argument function; retry without it there, because that database
  // has no event policy to bypass. The page keeps its photos and the old behaviour is unchanged.
  let result = await client.rpc("public_player_photos", {
    p_ids: ids,
    p_tournament: tournamentId ?? null,
  });
  if (result.error && isMissingFunction(result.error)) {
    result = await client.rpc("public_player_photos", { p_ids: ids });
  }
  const { data, error } = result;
  if (error) throw new Error(`Could not load public player photos: ${error.message}`);
  if (!Array.isArray(data)) return {};
  const photos: Record<string, string> = {};
  for (const row of data) {
    if (!isRecord(row)) continue;
    const playerId = text(row.player_id);
    const photoPath = text(row.photo_path);
    if (playerId && photoPath) photos[playerId] = photoPath;
  }
  return photos;
}

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}
