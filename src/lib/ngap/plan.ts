import { buildMergeQueue } from "./merge";
import type { ImportOptions, ImportPlan, ImportRecord, KnownPlayer, ParsedFile } from "./types";

/**
 * The strict import plan: every row must be decided or clean before it appears here. It is built on
 * the same review queue the organizer sees (`buildMergeQueue`), so the two can never disagree, and
 * it keeps the rule that an unclear match is an error rather than a guess.
 */
export function buildImportPlan(
  file: ParsedFile,
  known: KnownPlayer[],
  options: ImportOptions,
): ImportPlan {
  const queue = buildMergeQueue(file, known, options);
  const errors = [...queue.errors];
  const warnings = [...queue.warnings];
  const records: ImportRecord[] = [];

  for (const row of queue.rows) {
    if (row.skip) continue;
    if (row.conflicts.length > 0) {
      errors.push({ row: row.row, message: `${row.name}: ${row.conflicts[0]}` });
      continue;
    }
    const candidate = row.candidates[0] ?? null;
    records.push({
      row: row.row,
      playerId: candidate ? candidate.playerId : null,
      name: row.name,
      ngapId: row.ngapId,
      index: row.index,
      effectiveDate: row.effectiveDate,
      matchedBy: candidate ? row.matchedBy : "none",
    });
  }

  return {
    records,
    errors,
    warnings,
    summary: {
      total: file.rows.length,
      matched: records.filter((r) => r.playerId).length,
      newPlayers: records.filter((r) => !r.playerId).length,
      noHandicap: records.filter((r) => r.index === null).length,
      errors: errors.length,
    },
  };
}
