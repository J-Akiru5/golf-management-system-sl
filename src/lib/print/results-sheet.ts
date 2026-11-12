/**
 * Turns one day's scoring round into printable result tables.
 *
 * Pure: the print center passes in the players and totals the scoring engine already derived, and
 * this module orders them and lays them out. Day 1 is the club's special case: the morning and
 * afternoon are separate results even though the schema stores one competition round for the day.
 * Every other day prints one table for the whole round.
 */
import type { ScoringRoundView } from "@/lib/data/scoring";
import type { SessionKey } from "@/lib/data/sessions";

export const RESULTS_DASH = "—";

export interface ResultsPlayerInput {
  playerId: string;
  playerName: string;
  playingHandicap: number | null;
  /** Null when the player has no scorecard at all. */
  grossStrokes: number | null;
  netStrokes: number | null;
  /** Net Stableford points. Null when there is no card or no handicap snapshot. */
  points: number | null;
  holesPlayed: number;
  holesTotal: number;
  /** AM or PM on Day 1, where the two sessions are printed apart. */
  session: SessionKey | null;
}

export interface ResultsSheetInput {
  eventName: string;
  dayNumber: number;
  dayLabel: string;
  playDate: string | null;
  dateLabel: string;
  players: readonly ResultsPlayerInput[];
  /** Day 1 only: one table for AM and one for PM. */
  splitBySession: boolean;
  /** "all" keeps both sessions; a session key prints only that one. */
  session?: SessionKey | "all";
}

export interface ResultsRow {
  playerId: string;
  playerName: string;
  /** Null for a player without a card: an unranked line, never a zero. */
  position: number | null;
  tied: boolean;
  playingHandicap: number | null;
  grossStrokes: number | null;
  netStrokes: number | null;
  points: number | null;
  holesPlayed: number;
  holesTotal: number;
  noCard: boolean;
}

export interface ResultsTable {
  key: string;
  /** "Day 1 · AM", or "Day 2" when the whole round is one table. */
  title: string;
  session: SessionKey | null;
  rows: ResultsRow[];
}

export interface ResultsSheet {
  eventName: string;
  dayNumber: number;
  dayLabel: string;
  playDate: string | null;
  dateLabel: string;
  tables: ResultsTable[];
}

/** "1", "2T": a tie shares its position and carries the mark. */
export function resultPosition(row: ResultsRow): string {
  return row.position === null ? RESULTS_DASH : `${row.position}${row.tied ? "T" : ""}`;
}

/** A score for a cell or a spreadsheet: a number when there is one, otherwise a clear dash. */
export function resultScore(value: number | null): number | string {
  return value === null ? RESULTS_DASH : value;
}

/** "18/18" for a complete card, "9/18" for an incomplete one, and a dash when there is no card. */
export function resultHoles(row: ResultsRow): string {
  if (row.noCard) return RESULTS_DASH;
  if (row.holesTotal <= 0) return String(row.holesPlayed);
  return `${row.holesPlayed}/${row.holesTotal}`;
}

function nameOrder(a: ResultsRow, b: ResultsRow): number {
  return a.playerName.localeCompare(b.playerName) || a.playerId.localeCompare(b.playerId);
}

/**
 * Orders a session by net Stableford points. A tie shares a position and is marked; the next
 * player takes the position after the tied group (1, 1, 3). A player with no net result is listed
 * last, unranked, so an incomplete return never looks like a score of zero.
 */
function rankPlayers(players: readonly ResultsPlayerInput[]): ResultsRow[] {
  const rows: ResultsRow[] = players.map((player) => ({
    playerId: player.playerId,
    playerName: player.playerName,
    position: null,
    tied: false,
    playingHandicap: player.playingHandicap,
    grossStrokes: player.grossStrokes,
    netStrokes: player.netStrokes,
    points: player.points,
    holesPlayed: player.holesPlayed,
    holesTotal: player.holesTotal,
    noCard: player.grossStrokes === null,
  }));

  const ranked = rows.filter((row) => row.points !== null);
  const unranked = rows.filter((row) => row.points === null);

  ranked.sort(
    (a, b) =>
      (b.points ?? 0) - (a.points ?? 0) ||
      (a.netStrokes ?? Number.POSITIVE_INFINITY) - (b.netStrokes ?? Number.POSITIVE_INFINITY) ||
      nameOrder(a, b),
  );
  unranked.sort(nameOrder);

  let position = 0;
  let previousPoints: number | null = null;
  for (const [index, row] of ranked.entries()) {
    if (previousPoints === null || row.points !== previousPoints) position = index + 1;
    row.position = position;
    previousPoints = row.points;
  }

  const playersAtPoints = new Map<number, number>();
  for (const row of ranked) {
    if (row.points === null) continue;
    playersAtPoints.set(row.points, (playersAtPoints.get(row.points) ?? 0) + 1);
  }
  for (const row of ranked) {
    row.tied = row.points !== null && (playersAtPoints.get(row.points) ?? 0) > 1;
  }

  return [...ranked, ...unranked];
}

function tableForSession(
  input: ResultsSheetInput,
  key: string,
  session: SessionKey | null,
  title: string,
  players: readonly ResultsPlayerInput[],
): ResultsTable {
  return {
    key: `${input.dayNumber}-${key}`,
    title,
    session,
    rows: rankPlayers(players),
  };
}

export function buildResultsSheet(input: ResultsSheetInput): ResultsSheet {
  const base = {
    eventName: input.eventName,
    dayNumber: input.dayNumber,
    dayLabel: input.dayLabel,
    playDate: input.playDate,
    dateLabel: input.dateLabel,
  };

  if (!input.splitBySession) {
    return {
      ...base,
      tables: [tableForSession(input, "all", null, input.dayLabel, input.players)],
    };
  }

  const wanted = input.session ?? "all";
  const unassigned = input.players.filter((player) => player.session === null);

  // A round with no recorded session at all cannot be split. A single honest table is better than
  // two empty ones and a stray group.
  if (wanted === "all" && input.players.length > 0 && unassigned.length === input.players.length) {
    return {
      ...base,
      tables: [
        tableForSession(input, "unset", null, `${input.dayLabel} · session not set`, unassigned),
      ],
    };
  }

  const tables = (["AM", "PM"] as const)
    .filter((session) => wanted === "all" || wanted === session)
    .map((session) =>
      tableForSession(
        input,
        session,
        session,
        `${input.dayLabel} · ${session}`,
        input.players.filter((player) => player.session === session),
      ),
    );

  // A player with no recorded session is not guessed into AM or PM. It is shown apart, and only
  // when there is one, so the normal Day 1 sheet stays the two tables the club asked for.
  if (wanted === "all" && unassigned.length > 0) {
    tables.push(
      tableForSession(input, "unset", null, `${input.dayLabel} · session not set`, unassigned),
    );
  }

  return { ...base, tables };
}

/**
 * Reads every player in a round, not only the ranked board. The scoring engine leaves a player
 * with no counted hole out of `standings.players`; that player still belongs on the sheet with a
 * dash so the desk can see who has not returned a card.
 */
export function resultsPlayersFromRound(
  round: ScoringRoundView,
  sessionOf: (playerId: string) => SessionKey | null,
): ResultsPlayerInput[] {
  const totals = new Map(round.standings.players.map((row) => [row.playerId, row]));

  return round.players.map((player) => {
    const row = totals.get(player.playerId);
    return {
      playerId: player.playerId,
      playerName: player.playerName,
      playingHandicap: player.handicap?.playingHandicap ?? null,
      grossStrokes: row?.grossStrokes ?? null,
      netStrokes: row?.netStrokes ?? null,
      points: row?.netPoints ?? null,
      holesPlayed: row?.holesCounted ?? 0,
      holesTotal: row?.totalHoles ?? round.course.holes.length,
      session: sessionOf(player.playerId),
    };
  });
}
