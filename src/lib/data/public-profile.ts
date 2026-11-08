import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/format";
import { mapScorecard, type PortalScorecard } from "@/lib/player/portal";
import type { Database } from "@/lib/supabase/types";

/**
 * One confirmed player's public profile.
 *
 * The database returns the player summary and that player's frozen cards only. The page never
 * receives another player's hole-by-hole card from this path.
 */

export interface PublicProfilePlayer {
  id: string;
  name: string;
  index: number | null;
  category: string | null;
  flight: string | null;
  pairNumber: number | null;
}

export interface PublicProfilePartner {
  id: string;
  name: string;
}

export interface PublicPlayerProfileData {
  tournamentId: string | null;
  player: PublicProfilePlayer;
  partner: PublicProfilePartner | null;
  cards: PortalScorecard[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function wholeOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

/** Validates the JSON returned by `public_player_scorecard()`. */
export function parsePublicPlayerProfile(value: unknown): PublicPlayerProfileData | null {
  if (!isRecord(value) || !isRecord(value.player)) return null;
  const id = text(value.player.id);
  const name = text(value.player.name);
  if (!id || !name) return null;

  const player: PublicProfilePlayer = {
    id,
    name: displayName(name),
    index: numberOrNull(value.player.index),
    category: text(value.player.category),
    flight: text(value.player.flight),
    pairNumber: wholeOrNull(value.player.pairNumber),
  };

  let partner: PublicProfilePartner | null = null;
  if (isRecord(value.partner)) {
    const partnerId = text(value.partner.id);
    const partnerName = text(value.partner.name);
    if (partnerId && partnerName) partner = { id: partnerId, name: displayName(partnerName) };
  }

  const cards: PortalScorecard[] = [];
  if (Array.isArray(value.cards)) {
    for (const raw of value.cards) {
      const card = mapScorecard(raw);
      if (card) cards.push(card);
    }
  }
  cards.sort((a, b) => a.dayNumber - b.dayNumber || a.roundId.localeCompare(b.roundId));

  return {
    tournamentId: text(value.tournamentId),
    player,
    partner,
    cards,
  };
}

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

export async function loadPublicPlayerProfile(
  client: SupabaseClient<Database>,
  playerId: string,
  tournamentId?: string | null,
): Promise<PublicPlayerProfileData | null> {
  const { data, error } = await client.rpc("public_player_scorecard", {
    p_player: playerId,
    p_tournament: tournamentId ?? null,
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw new Error(`Could not load the player profile: ${error.message}`);
  }
  return parsePublicPlayerProfile(data);
}

function normalise(textValue: string): string {
  return textValue
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * The search on the profile tab. It only lists confirmed players from the programme, and it stops
 * at `limit` matches so a phone does not render the whole field while someone types.
 */
export function searchProfilePlayers(
  players: readonly {
    id: string | null;
    name: string;
    flight: string | null;
    category: string | null;
  }[],
  query: string,
  limit = 12,
): Array<{ id: string; name: string; flight: string | null; category: string | null }> {
  const wanted = normalise(query);
  if (wanted === "") return [];
  return players
    .filter(
      (
        player,
      ): player is { id: string; name: string; flight: string | null; category: string | null } =>
        player.id !== null,
    )
    .filter((player) => normalise(player.name).includes(wanted))
    .slice(0, Math.max(0, limit));
}
