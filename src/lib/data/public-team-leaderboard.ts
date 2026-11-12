import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/format";
import { formatToPar } from "@/lib/player/scorecard";
import type { Database } from "@/lib/supabase/types";

/**
 * The public cumulative team leaderboard.
 *
 * The database returns one row per player per published round. This module adds the two partners
 * together, filters by category and class, and keeps the top ten. It reads the frozen publication
 * totals only: no hole-by-hole card is part of this payload.
 */

export type PublicTeamState = "provisional" | "final";

export interface PublicTeamRound {
  roundId: string;
  dayNumber: number;
  playDate: string;
  state: PublicTeamState;
  version: number;
  publishedAt: string;
}

export interface PublicTeamPlayerRow {
  roundId: string;
  dayNumber: number;
  playDate: string;
  state: PublicTeamState;
  version: number;
  publishedAt: string;
  playerId: string;
  playerName: string;
  /** Which side of the pair this player fills. Null on a database without the side field yet. */
  side: "member" | "guest" | null;
  flightName: string | null;
  categoryName: string | null;
  pairNumber: number | null;
  pairKey: string;
  grossStrokes: number | null;
  netStrokes: number | null;
  grossPoints: number | null;
  netPoints: number | null;
  holesCounted: number;
  holesTotal: number;
  parTotal: number;
}

export interface PublicTieBreak {
  name: string;
  procedure: string;
  version: string;
}

export interface PublicTeamLeaderboardData {
  tournamentId: string | null;
  eventName: string | null;
  tieBreak: PublicTieBreak | null;
  rounds: PublicTeamRound[];
  rows: PublicTeamPlayerRow[];
}

/** One partner's published points, added over every counted round. Null when no round has a value. */
export interface PublicTeamMember {
  playerId: string;
  name: string;
  side: "member" | "guest" | null;
  grossPoints: number | null;
  netPoints: number | null;
}

export interface PublicTeamStanding {
  key: string;
  pairNumber: number | null;
  name: string;
  playerNames: string[];
  playerIds: string[];
  /** The member and guest names, member first. Null when that side is not on file. */
  memberName: string | null;
  guestName: string | null;
  /** Each partner with their own accumulated points, member first. */
  members: PublicTeamMember[];
  flightName: string | null;
  categories: string[];
  holesCounted: number;
  holesTotal: number;
  grossStrokes: number | null;
  netStrokes: number | null;
  parTotal: number | null;
  grossPoints: number | null;
  netPoints: number | null;
  toPar: string;
  roundsCounted: number;
  rank: number;
  tied: boolean;
}

export interface PublicTeamFilters {
  category?: string;
  flight?: string;
}

export interface PublicTeamOptions {
  categories: string[];
  flights: string[];
}

export interface PublicTeamLeaderboard {
  teams: PublicTeamStanding[];
  unpaired: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function whole(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function count(value: unknown): number {
  return whole(value) ?? 0;
}

function stateOf(value: unknown): PublicTeamState | null {
  return value === "provisional" || value === "final" ? value : null;
}

function parseRound(value: unknown): PublicTeamRound | null {
  if (!isRecord(value)) return null;
  const roundId = text(value.roundId);
  const dayNumber = whole(value.dayNumber);
  const playDate = text(value.playDate);
  const state = stateOf(value.state);
  const version = whole(value.version);
  const publishedAt = text(value.publishedAt);
  if (!roundId || dayNumber === null || !playDate || !state || version === null || !publishedAt) {
    return null;
  }
  return { roundId, dayNumber, playDate, state, version, publishedAt };
}

function parseRow(value: unknown): PublicTeamPlayerRow | null {
  if (!isRecord(value)) return null;
  const roundId = text(value.roundId);
  const dayNumber = whole(value.dayNumber);
  const playDate = text(value.playDate);
  const state = stateOf(value.state);
  const version = whole(value.version);
  const publishedAt = text(value.publishedAt);
  const playerId = text(value.playerId);
  const playerName = text(value.playerName);
  const pairKey = text(value.pairKey);
  const side = value.side === "member" || value.side === "guest" ? value.side : null;
  if (
    !roundId ||
    dayNumber === null ||
    !playDate ||
    !state ||
    version === null ||
    !publishedAt ||
    !playerId ||
    !playerName ||
    !pairKey
  ) {
    return null;
  }
  return {
    roundId,
    dayNumber,
    playDate,
    state,
    version,
    publishedAt,
    playerId,
    playerName: displayName(playerName),
    side,
    flightName: text(value.flightName),
    categoryName: text(value.categoryName),
    pairNumber: whole(value.pairNumber),
    pairKey,
    grossStrokes: whole(value.grossStrokes),
    netStrokes: whole(value.netStrokes),
    grossPoints: whole(value.grossPoints),
    netPoints: whole(value.netPoints),
    holesCounted: count(value.holesCounted),
    holesTotal: count(value.holesTotal),
    parTotal: count(value.parTotal),
  };
}

/** Validates the JSON returned by `public_team_leaderboard()`. */
export function parsePublicTeamLeaderboard(value: unknown): PublicTeamLeaderboardData | null {
  if (!isRecord(value) || !Array.isArray(value.rounds) || !Array.isArray(value.rows)) {
    return null;
  }

  const rounds: PublicTeamRound[] = [];
  for (const raw of value.rounds) {
    const round = parseRound(raw);
    if (round) rounds.push(round);
  }
  rounds.sort((a, b) => a.dayNumber - b.dayNumber);

  const rows: PublicTeamPlayerRow[] = [];
  for (const raw of value.rows) {
    const row = parseRow(raw);
    if (row) rows.push(row);
  }
  rows.sort(
    (a, b) =>
      a.dayNumber - b.dayNumber ||
      a.pairKey.localeCompare(b.pairKey) ||
      a.playerName.localeCompare(b.playerName),
  );

  let tieBreak: PublicTieBreak | null = null;
  if (isRecord(value.tieBreak)) {
    const name = text(value.tieBreak.name);
    const procedure = text(value.tieBreak.procedure);
    const version = text(value.tieBreak.version);
    if (name && procedure && version) tieBreak = { name, procedure, version };
  }

  return {
    tournamentId: text(value.tournamentId),
    eventName: text(value.eventName),
    tieBreak,
    rounds,
    rows,
  };
}

/**
 * The database function is new. A database that has not applied the migration answers with
 * PGRST202; the page then keeps its previous round view instead of failing.
 */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

export async function loadPublicTeamLeaderboard(
  client: SupabaseClient<Database>,
  tournamentId?: string | null,
): Promise<PublicTeamLeaderboardData | null> {
  const { data, error } = await client.rpc("public_team_leaderboard", {
    p_tournament: tournamentId ?? null,
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw new Error(`Could not load the team leaderboard: ${error.message}`);
  }
  return parsePublicTeamLeaderboard(data);
}

function sumNullable(values: Array<number | null>): number | null {
  if (values.length === 0) return null;
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** A player's total over their rows. Null only when every row is null. */
function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0);
}

function sameRank(a: PublicTeamStanding, b: PublicTeamStanding): boolean {
  return a.netPoints === b.netPoints && a.grossPoints === b.grossPoints;
}

/**
 * Adds the two partners together. A pair that does not have both partners in the published rows is
 * counted as unpaired and is not ranked: the event is a two-man aggregate Stableford.
 */
export function buildTeamLeaderboard(data: PublicTeamLeaderboardData): PublicTeamLeaderboard {
  const groups = new Map<string, PublicTeamPlayerRow[]>();
  for (const row of data.rows) {
    const group = groups.get(row.pairKey) ?? [];
    group.push(row);
    groups.set(row.pairKey, group);
  }

  const teams: PublicTeamStanding[] = [];
  let unpaired = 0;

  for (const [key, rows] of groups) {
    const players = new Map<string, PublicTeamPlayerRow>();
    for (const row of rows) {
      if (!players.has(row.playerId)) players.set(row.playerId, row);
    }
    if (players.size < 2) {
      unpaired += 1;
      continue;
    }

    const byRound = new Map<string, PublicTeamPlayerRow[]>();
    for (const row of rows) {
      const round = byRound.get(row.roundId) ?? [];
      round.push(row);
      byRound.set(row.roundId, round);
    }

    let holesCounted = 0;
    let holesTotal = 0;
    for (const roundRows of byRound.values()) {
      if (roundRows.length < 2) continue;
      holesCounted += Math.min(...roundRows.map((row) => row.holesCounted));
      holesTotal += Math.max(...roundRows.map((row) => row.holesTotal));
    }

    const playerRows = [...players.values()];
    const member = playerRows.find((row) => row.side === "member") ?? null;
    const guest = playerRows.find((row) => row.side === "guest") ?? null;
    const ordered = [
      ...(member ? [member] : []),
      ...(guest ? [guest] : []),
      ...playerRows
        .filter((row) => row !== member && row !== guest)
        .sort((a, b) => a.playerName.localeCompare(b.playerName)),
    ];
    const playerNames = ordered.map((row) => row.playerName);
    const playerIds = ordered.map((row) => row.playerId);
    const categories = [
      ...new Set(
        [...players.values()]
          .map((row) => row.categoryName?.trim() ?? "")
          .filter((name) => name !== ""),
      ),
    ].sort((a, b) => a.localeCompare(b));
    const flights = [
      ...new Set(
        [...players.values()]
          .map((row) => row.flightName?.trim() ?? "")
          .filter((name) => name !== ""),
      ),
    ].sort((a, b) => a.localeCompare(b));

    const grossStrokes = sumNullable(rows.map((row) => row.grossStrokes));
    const parTotal = sumNullable(rows.map((row) => row.parTotal));
    const toPar =
      grossStrokes !== null && parTotal !== null && parTotal > 0
        ? formatToPar(grossStrokes - parTotal)
        : "-";

    teams.push({
      key,
      pairNumber: players.values().next().value?.pairNumber ?? null,
      name: playerNames.join(" / "),
      playerNames,
      playerIds,
      memberName: ordered[0]?.playerName ?? null,
      guestName: ordered[1]?.playerName ?? null,
      members: ordered.map((row) => {
        const own = rows.filter((candidate) => candidate.playerId === row.playerId);
        return {
          playerId: row.playerId,
          name: row.playerName,
          side: row.side,
          grossPoints: sumKnown(own.map((candidate) => candidate.grossPoints)),
          netPoints: sumKnown(own.map((candidate) => candidate.netPoints)),
        };
      }),
      flightName: flights.length > 0 ? flights.join(" / ") : null,
      categories,
      holesCounted,
      holesTotal,
      grossStrokes,
      netStrokes: sumNullable(rows.map((row) => row.netStrokes)),
      parTotal,
      grossPoints: sumNullable(rows.map((row) => row.grossPoints)),
      netPoints: sumNullable(rows.map((row) => row.netPoints)),
      toPar,
      roundsCounted: byRound.size,
      rank: 0,
      tied: false,
    });
  }

  return { teams: rankTeams(teams), unpaired };
}

/** Stable order: net points, then gross points, then the team name. Ties keep the same rank. */
export function rankTeams(teams: PublicTeamStanding[]): PublicTeamStanding[] {
  const sorted = [...teams].sort((a, b) => {
    if (a.netPoints !== b.netPoints) {
      if (a.netPoints === null) return 1;
      if (b.netPoints === null) return -1;
      return b.netPoints - a.netPoints;
    }
    if (a.grossPoints !== b.grossPoints) {
      if (a.grossPoints === null) return 1;
      if (b.grossPoints === null) return -1;
      return b.grossPoints - a.grossPoints;
    }
    return a.name.localeCompare(b.name);
  });

  const ranked: PublicTeamStanding[] = [];
  for (const [index, team] of sorted.entries()) {
    const previous = sorted[index - 1];
    const tied = previous !== undefined && sameRank(previous, team);
    const rank = tied ? (ranked[index - 1]?.rank ?? index + 1) : index + 1;
    ranked.push({ ...team, rank, tied });
    if (tied && ranked[index - 1]) ranked[index - 1] = { ...ranked[index - 1]!, tied: true };
  }
  return ranked;
}

/** Category matches either partner; class matches the team's class. */
export function filterTeams(
  teams: PublicTeamStanding[],
  filters: PublicTeamFilters = {},
): PublicTeamStanding[] {
  const category = filters.category?.trim() ?? "";
  const flight = filters.flight?.trim() ?? "";
  return teams.filter((team) => {
    if (category && !team.categories.includes(category)) return false;
    if (flight && (team.flightName ?? "").trim() !== flight) return false;
    return true;
  });
}

/** The table always stops at ten teams. Ties do not expand the list. */
export function topTeams(teams: PublicTeamStanding[], limit = 10): PublicTeamStanding[] {
  return teams.slice(0, Math.max(0, limit));
}

export function teamOptions(data: PublicTeamLeaderboardData): PublicTeamOptions {
  const categories = new Set<string>();
  const flights = new Set<string>();
  for (const row of data.rows) {
    const category = row.categoryName?.trim();
    if (category) categories.add(category);
    const flight = row.flightName?.trim();
    if (flight) flights.add(flight);
  }
  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    flights: [...flights].sort((a, b) => a.localeCompare(b)),
  };
}
