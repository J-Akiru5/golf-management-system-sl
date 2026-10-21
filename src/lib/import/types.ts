/**
 * The registration-workbook import contract.
 *
 * The AI and the browser are allowed to propose a mapping and per-row decisions. They are never
 * allowed to send SQL, a player id that was not shown to the operator, or a final count. The server
 * re-parses the file, re-runs normalization and matching, and the database function revalidates
 * everything again before writing.
 */

export const CANONICAL_FIELDS = [
  "name",
  "firstName",
  "lastName",
  "membershipType",
  "gender",
  "birthdate",
  "ngapId",
  "whsId",
  "handicap",
  "contactNumber",
  "email",
  "homeCourse",
  "shirtSize",
  "paymentStatus",
  "paymentAmount",
  "paymentReference",
  "sponsor",
  "sponsorDetails",
  "gameDates",
  "teeTimePreference",
  "notes",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/**
 * `memberName` and `guestName` are extra source slots, not canonical fields: the club workbook has
 * one column for the member and another for the guest. A row with both produces two players.
 */
export const SOURCE_SLOTS = ["memberName", "guestName"] as const;

export type SourceSlot = (typeof SOURCE_SLOTS)[number];

export type MappingKey = CanonicalField | SourceSlot;

/** A workbook that marks each playing day in its own column, e.g. DAY 1 ... DAY 4. */
export interface DayColumn {
  dayNumber: number;
  header: string;
}

export type ColumnMapping = Partial<Record<MappingKey, string | null>>;

export type MappingSource = "deterministic" | "ai" | "manual";

export interface MappingSuggestion {
  mapping: ColumnMapping;
  /** 0..1 per key. A missing key means the deterministic rules did not find it. */
  confidence: Partial<Record<MappingKey, number>>;
  reasons: Partial<Record<MappingKey, string>>;
  unmappedHeaders: string[];
  /** Day columns detected as separate DAY 1 ... DAY N columns. */
  dayColumns?: DayColumn[];
  /** When a single `MEMBER` or `GUEST` name column is mapped, every row gets this type. */
  fixedMembershipType?: "member" | "guest" | null;
  source: MappingSource;
  notes: string[];
}

export interface SourceTable {
  headers: string[];
  rows: string[][];
}

export interface SourceRow {
  /** 1-based row number in the sheet, counting the header as row 1. */
  row: number;
  values: Record<string, string>;
}

export interface TournamentDayRef {
  dayNumber: number;
  /** ISO date. */
  playDate: string;
  label: string;
  startTime: string | null;
  isPlayingDay: boolean;
}

export interface ExistingPlayerRef {
  id: string;
  name: string;
  ngapId: string | null;
  birthdate: string | null;
  gender: "M" | "F" | null;
  contactNumber: string | null;
  email: string | null;
}

export interface ExistingRegistrationRef {
  id: string;
  playerId: string;
}

export type MatchConfidence = "exact" | "strong" | "weak";

export interface PlayerMatchCandidate {
  playerId: string;
  name: string;
  ngapId: string | null;
  birthdate: string | null;
  confidence: MatchConfidence;
  signals: string[];
  warnings: string[];
  conflicts: string[];
}

export interface MatchResult {
  candidates: PlayerMatchCandidate[];
  recommendation: "link" | "create" | "review";
  matchedBy: "ngap_id" | "name" | "none";
}

export type RowAction = "insert" | "update" | "skip" | "reject";

export type IssueSeverity = "error" | "warning" | "info";

export interface ImportIssue {
  row: number;
  field: MappingKey | "file" | "match" | "days";
  severity: IssueSeverity;
  message: string;
}

export interface NormalizedRegistrationRow {
  /** Sequential import-row number, unique within the batch. */
  row: number;
  /** The row in the sheet, counting the header as row 1. */
  sourceRow: number;
  raw: Record<string, string>;
  name: string;
  firstName: string | null;
  lastName: string | null;
  membershipType: "member" | "guest" | null;
  gender: "M" | "F" | null;
  birthdate: string | null;
  ngapId: string | null;
  whsId: string | null;
  declaredHandicap: string | null;
  contactNumber: string | null;
  email: string | null;
  homeCourse: string | null;
  shirtSize: string | null;
  paymentStatus: "paid" | "unpaid" | "waived" | null;
  paymentAmount: number | null;
  paymentReference: string | null;
  sponsor: boolean | null;
  sponsorDetails: string | null;
  /** Tournament day numbers, not display strings. */
  days: number[];
  dayNote: string | null;
  teeTimeNote: string | null;
  notes: string | null;
  /** True when the operator explicitly chose "create a separate player" for an ambiguous name. */
  forceNew: boolean;
  /** The player the operator chose to link to, or null. */
  linkPlayerId: string | null;
  match: MatchResult;
  existingRegistrationId: string | null;
  action: RowAction;
  issues: ImportIssue[];
  /** True when the operator must choose link/create/skip before the row can be committed. */
  requiresDecision: boolean;
}

export interface RowDecision {
  action: "link" | "create" | "skip" | "update";
  playerId?: string;
}

export interface PreviewSummary {
  total: number;
  insert: number;
  update: number;
  skip: number;
  reject: number;
  needsDecision: number;
  warnings: number;
  errors: number;
  newPlayers: number;
  matchedPlayers: number;
  /** New players saved without a birthdate or gender; they show as Needs review in the desk. */
  incompleteProfiles: number;
  selectedDays: number;
}

export interface ImportPreview {
  fileName: string;
  worksheet: string | null;
  fileSha256: string;
  fileSize: number;
  rows: NormalizedRegistrationRow[];
  mapping: MappingSuggestion;
  summary: PreviewSummary;
  issues: ImportIssue[];
  tournamentId: string;
  dayRule: { required: number | null; max: number | null; days: TournamentDayRef[] };
  /** True when the database objects for the new model are present. */
  schemaReady: boolean;
  /** A warning shown above the preview, never a silent fallback. */
  warnings: string[];
}
