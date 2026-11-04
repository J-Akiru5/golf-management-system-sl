/**
 * The live board's rows and the rank movement between two published versions.
 *
 * The board is an ordered list: an index is a rank. Movement is therefore one comparison of where
 * a player stood and where they stand now, which keeps the animation honest when the club publishes
 * a corrected version (a player really can drop on a correction).
 */
export interface LiveBoardRow {
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

export interface LiveBoardPayload {
  roundId: string;
  eventName: string;
  dayNumber: number;
  playDate: string;
  version: number;
  state: "provisional" | "final";
  publishedAt: string;
  rows: LiveBoardRow[];
}

export interface RankMove {
  key: string;
  from: number;
  to: number;
  /** Positive when the player moved up the board. */
  delta: number;
}

/**
 * A snapshot saved before player ids existed has no id to match on, so the key falls back to the
 * name. Names are shown in capitals on the board, so two players would have to share a full name
 * before they could be confused.
 */
export const boardKey = (row: LiveBoardRow): string =>
  row.playerId ?? `name:${row.playerName.trim().toLowerCase()}`;

/** Every player whose rank changed, in the new order. Unchanged players are not listed. */
export function rankMoves(
  previous: readonly LiveBoardRow[],
  next: readonly LiveBoardRow[],
): RankMove[] {
  const before = new Map(previous.map((row, index) => [boardKey(row), index + 1]));
  return next.flatMap((row, index) => {
    const from = before.get(boardKey(row));
    const to = index + 1;
    if (from === undefined || from === to) return [];
    return [{ key: boardKey(row), from, to, delta: from - to }];
  });
}

/**
 * The signed-in player's row. The id is the proof; the name is only used for a snapshot that has
 * no ids at all, where showing nothing would be worse than a name match.
 */
export function findYou(
  rows: readonly LiveBoardRow[],
  you: { playerId: string | null; name: string },
): { row: LiveBoardRow; rank: number } | null {
  const name = you.name.trim().toLowerCase();
  const index = rows.findIndex((row) =>
    you.playerId !== null
      ? row.playerId === you.playerId ||
        (row.playerId === null && row.playerName.trim().toLowerCase() === name)
      : row.playerName.trim().toLowerCase() === name,
  );
  const row = index >= 0 ? rows[index] : undefined;
  return row ? { row, rank: index + 1 } : null;
}
