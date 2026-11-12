/**
 * The bulk scorecard transcription format.
 *
 * This is separate from the photo reader contract in `src/lib/scoring/scan`. A transcription file
 * names the round, the player, the marker and 18 gross scores. The reader contract describes one
 * photo and carries a confidence per hole.
 */

export const SCORECARD_IMPORT_FORMAT = "teeline-scorecard-import";
export const SCORECARD_IMPORT_VERSION = 1;

/** The 18 hole scores keyed by the printed hole number, "1" to "18". */
export type ScorecardImportHoles = Record<string, number>;

export interface ScorecardImportCard {
  /** Stable within the file and across re-imports. Used as the capture key. */
  cardKey: string;
  groupNumber: number | null;
  playerId: string | null;
  playerName: string | null;
  markerPlayerId: string | null;
  markerName: string | null;
  /** The total written on the paper card, or null when the card has none. */
  writtenTotal: number | null;
  holes: ScorecardImportHoles;
  notes: string | null;
}

export interface ScorecardImportSkipped {
  groupNumber: number | null;
  playerName: string;
  reason: string;
}

export interface ScorecardImportFile {
  format: typeof SCORECARD_IMPORT_FORMAT;
  version: typeof SCORECARD_IMPORT_VERSION;
  roundId: string;
  tournamentId: string;
  dayNumber: number;
  extractedBy: string;
  extractedAt: string;
  cards: ScorecardImportCard[];
  skipped: ScorecardImportSkipped[];
}

export interface ScorecardImportProblem {
  /** A path into the file, for example `cards[3].holes.7`. */
  path: string;
  message: string;
}
