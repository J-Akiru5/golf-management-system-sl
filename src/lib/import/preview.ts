import { type DateFormat } from "./dates";
import { normalizeRows } from "./normalize";
import type {
  ColumnMapping,
  ExistingPlayerRef,
  ExistingRegistrationRef,
  ImportIssue,
  ImportPreview,
  MappingSuggestion,
  NormalizedRegistrationRow,
  PreviewSummary,
  RowDecision,
  SourceTable,
  TournamentDayRef,
} from "./types";

export interface PreviewOptions {
  fileName: string;
  worksheet: string | null;
  fileSha256: string;
  fileSize: number;
  tournamentId: string;
  mapping: MappingSuggestion;
  dateFormat: DateFormat;
  days: TournamentDayRef[];
  dayRule: { required: number | null; max: number | null };
  existingPlayers: ExistingPlayerRef[];
  existingRegistrations: ExistingRegistrationRef[];
  decisions?: Record<number, RowDecision>;
  dayOverrides?: Record<number, number[]>;
  schemaReady: boolean;
}

function summarize(rows: NormalizedRegistrationRow[]): PreviewSummary {
  const summary: PreviewSummary = {
    total: rows.length,
    insert: 0,
    update: 0,
    skip: 0,
    reject: 0,
    needsDecision: 0,
    warnings: 0,
    errors: 0,
    newPlayers: 0,
    matchedPlayers: 0,
    incompleteProfiles: 0,
    selectedDays: 0,
  };
  for (const row of rows) {
    summary.selectedDays += row.days.length;
    summary.warnings += row.issues.filter((i) => i.severity === "warning").length;
    summary.errors += row.issues.filter((i) => i.severity === "error").length;
    if (row.match.candidates.length > 0 || row.existingRegistrationId) summary.matchedPlayers += 1;
    if (row.match.candidates.length === 0 && !row.existingRegistrationId) summary.newPlayers += 1;
    if (
      row.action === "insert" &&
      row.match.candidates.length === 0 &&
      (!row.birthdate || !row.gender)
    ) {
      summary.incompleteProfiles += 1;
    }
    if (row.requiresDecision) {
      summary.needsDecision += 1;
      continue;
    }
    if (row.action === "insert") summary.insert += 1;
    else if (row.action === "update") summary.update += 1;
    else if (row.action === "skip") summary.skip += 1;
    else summary.reject += 1;
  }
  return summary;
}

export function buildPreview(table: SourceTable, options: PreviewOptions): ImportPreview {
  const rows = normalizeRows(table, {
    mapping: options.mapping.mapping as ColumnMapping,
    dayColumns: options.mapping.dayColumns,
    fixedMembershipType: options.mapping.fixedMembershipType ?? null,
    dateFormat: options.dateFormat,
    days: options.days,
    dayRule: options.dayRule,
    existingPlayers: options.existingPlayers,
    existingRegistrations: options.existingRegistrations,
    decisions: options.decisions,
    dayOverrides: options.dayOverrides,
  });

  const issues: ImportIssue[] = rows.flatMap((row) => row.issues);
  const warnings: string[] = [...options.mapping.notes];
  if (!options.schemaReady) {
    warnings.push(
      "The database update for structured days and import batches is not applied yet. You can preview and validate this file, but the commit is disabled until it is.",
    );
  }
  if (options.days.length === 0) {
    warnings.push(
      "This event has no playing days. The import cannot assign days until the event dates are saved.",
    );
  }

  return {
    fileName: options.fileName,
    worksheet: options.worksheet,
    fileSha256: options.fileSha256,
    fileSize: options.fileSize,
    rows,
    mapping: options.mapping,
    summary: summarize(rows),
    issues,
    tournamentId: options.tournamentId,
    dayRule: { required: options.dayRule.required, max: options.dayRule.max, days: options.days },
    schemaReady: options.schemaReady,
    warnings,
  };
}

/** True when the preview has an unresolved match or an uncertain day. Hard row errors are shown
 * and can be committed as rejected rows, but only after the operator approves the preview. */
export function previewBlocksCommit(preview: ImportPreview): boolean {
  if (!preview.schemaReady) return true;
  return preview.summary.needsDecision > 0;
}

/**
 * The rows sent to the database function. They are intentionally a small, named projection: the
 * function revalidates every one and never executes anything from the file or the AI.
 */
export function toCommitRows(rows: NormalizedRegistrationRow[]): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    row: row.row,
    sourceRow: row.sourceRow,
    action: row.requiresDecision ? "reject" : row.action,
    rejectReason: row.requiresDecision
      ? "This row still needs an operator decision."
      : row.issues.find((i) => i.severity === "error")?.message,
    name: row.name,
    firstName: row.firstName,
    lastName: row.lastName,
    membershipType: row.membershipType,
    gender: row.gender,
    birthdate: row.birthdate,
    ngapId: row.ngapId,
    whsId: row.whsId,
    declaredHandicap: row.declaredHandicap,
    contactNumber: row.contactNumber,
    email: row.email,
    homeCourse: row.homeCourse,
    shirtSize: row.shirtSize,
    paymentStatus: row.paymentStatus,
    paymentAmount: row.paymentAmount,
    paymentReference: row.paymentReference,
    paymentNote: null,
    sponsor: row.sponsor,
    sponsorDetails: row.sponsorDetails,
    days: row.days,
    teePreferences: {},
    extra: row.teeTimeNote ? { teeTimeNote: row.teeTimeNote } : {},
    notes: row.notes,
    linkPlayerId: row.linkPlayerId,
    forceNew: row.forceNew,
  }));
}

export function issueLabel(issue: ImportIssue): string {
  return `Row ${issue.row} · ${issue.field}: ${issue.message}`;
}
