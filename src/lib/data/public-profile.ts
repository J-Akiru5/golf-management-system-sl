import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/format";
import { sameName } from "@/lib/name-match";
import { mapScorecard, type PortalScorecard } from "@/lib/player/portal";
import type { Database } from "@/lib/supabase/types";
import type { PublicProgramme } from "./types";

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
  /** The playing handicap the system holds for this player's entry, whole strokes. */
  playingHandicap: number | null;
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

/** One confirmed start on one playing day, as the public profile may show it. */
export interface PublicProfileTeeTime {
  dayNumber: number;
  dayLabel: string;
  playDate: string;
  /** "HH:MM", never null: a day without a confirmed time is omitted, not padded. */
  teeTime: string;
  startHole: number | null;
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
    playingHandicap: wholeOrNull(value.player.playingHandicap),
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
      // The RPC already scopes cards to this player. Keep the boundary here too: a card that
      // names another player is dropped rather than shown on the wrong profile.
      if (card && (!card.playerId || card.playerId === id)) cards.push(card);
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

/**
 * The playing handicap the profile shows. A published card carries the handicap that round was scored
 * from, so it wins when there is one and the page agrees with the card under it. A player with no
 * published card shows the playing handicap the system holds for their entry, so every player has one.
 * Null only when the system has none either (no index or no tee yet).
 */
export function profilePlayingHandicap(
  data: Pick<PublicPlayerProfileData, "player" | "cards">,
): number | null {
  return data.cards[0]?.playingHandicap ?? data.player.playingHandicap ?? null;
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

/**
 * A player's confirmed starts, one per playing day, read from the public programme the page already
 * has. A day whose time is not confirmed contributes nothing: the profile shows no time rather than
 * a placeholder sentence. The player is matched by words, so a snapshot written "ORDOÑEZ, ULYSSES"
 * finds the profile shown as "ULYSSES ORDOÑEZ".
 */
export function profileTeeTimes(
  programme: Pick<PublicProgramme, "days">,
  playerName: string,
): PublicProfileTeeTime[] {
  const starts: PublicProfileTeeTime[] = [];
  for (const day of programme.days) {
    const player = day.players.find(
      (entry) => entry.confirmed && entry.teeTime !== null && sameName(entry.name, playerName),
    );
    if (!player?.teeTime) continue;
    starts.push({
      dayNumber: day.dayNumber,
      dayLabel: day.label,
      playDate: day.playDate,
      teeTime: player.teeTime,
      startHole: player.startHole,
    });
  }
  return starts.sort((a, b) => a.dayNumber - b.dayNumber);
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
