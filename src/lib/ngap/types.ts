/** Which spreadsheet column holds which field. Values are the exact header text from the file. */
export interface ColumnMapping {
  name: string;
  index: string;
  ngapId?: string;
  /** Date the index was effective. If absent, the whole file uses `defaultEffectiveDate`. */
  effectiveDate?: string;
  /** Optional identity signals. A real NGAP export may not carry them. */
  dob?: string;
  contact?: string;
}

export type DateFormat = "iso" | "mdy" | "dmy";

export interface ImportOptions {
  mapping: ColumnMapping;
  /** How slash dates are read. Never guessed, because 03/04/2026 means different days. */
  dateFormat: DateFormat;
  /** ISO date used when the file has no date column. */
  defaultEffectiveDate: string;
}

export interface KnownPlayer {
  id: string;
  fullName: string;
  ngapId: string | null;
  /** Optional identity signals used by the merge queue when the file supplies them. */
  birthdate?: string | null;
  contactNumber?: string | null;
}

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export type RowIssue = { row: number; message: string };

export interface ImportRecord {
  /** 1-based row number in the file, excluding the header. */
  row: number;
  /** Matched existing player, or null when this is someone new. */
  playerId: string | null;
  name: string;
  ngapId: string | null;
  /** Numeric index. A plus handicap such as "+2.3" is stored as -2.3. Null = no handicap ("NH"). */
  index: number | null;
  effectiveDate: string;
  matchedBy: "ngap_id" | "name" | "none";
}

export interface ImportPlan {
  records: ImportRecord[];
  /** Rows that cannot be imported. Nothing here is guessed or skipped silently. */
  errors: RowIssue[];
  /** Importable but worth a human look. */
  warnings: RowIssue[];
  summary: {
    total: number;
    matched: number;
    newPlayers: number;
    noHandicap: number;
    errors: number;
  };
}
