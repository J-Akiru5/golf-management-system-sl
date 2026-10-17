import { nameKey, parseDate, parseIndex } from "./normalize";
import type {
  ImportOptions,
  ImportPlan,
  ImportRecord,
  KnownPlayer,
  ParsedFile,
  RowIssue,
} from "./types";

/**
 * Turns a parsed NGAP file into a reviewable import plan. Pure: it reads nothing but its inputs
 * and writes nothing, so the organizer sees exactly what will change before anything is saved.
 *
 * Matching order: NGAP ID, then exact name (any word order). An unclear match is an error,
 * never a guess, because a wrong match would put one golfer's handicap on another golfer.
 */
export function buildImportPlan(
  file: ParsedFile,
  known: KnownPlayer[],
  options: ImportOptions,
): ImportPlan {
  const { mapping, dateFormat, defaultEffectiveDate } = options;
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  const missingColumns = [mapping.name, mapping.index, mapping.ngapId, mapping.effectiveDate]
    .filter((c): c is string => Boolean(c))
    .filter((c) => !file.headers.includes(c));
  if (missingColumns.length > 0) {
    throw new Error(`Column(s) not found in the file: ${missingColumns.join(", ")}`);
  }

  const byNgapId = new Map(known.filter((p) => p.ngapId).map((p) => [p.ngapId as string, p]));
  const byName = new Map<string, KnownPlayer[]>();
  for (const p of known) {
    const key = nameKey(p.fullName);
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }

  const records: ImportRecord[] = [];
  file.rows.forEach((raw, i) => {
    const row = i + 1;
    const fail = (message: string) => errors.push({ row, message });

    const name = (raw[mapping.name] ?? "").trim();
    if (!name) return fail("Name is empty.");

    const idRaw = mapping.ngapId ? (raw[mapping.ngapId] ?? "").trim() : "";
    const ngapId = idRaw === "" ? null : idRaw;

    const idx = parseIndex(raw[mapping.index] ?? "");
    if (!idx.ok) return fail(`${name}: ${idx.message}`);

    let effectiveDate = defaultEffectiveDate;
    if (mapping.effectiveDate) {
      const d = parseDate(raw[mapping.effectiveDate] ?? "", dateFormat);
      if (!d.ok) return fail(`${name}: ${d.message}`);
      effectiveDate = d.value;
    }

    let playerId: string | null = null;
    let matchedBy: ImportRecord["matchedBy"] = "none";

    const byId = ngapId ? byNgapId.get(ngapId) : undefined;
    if (byId) {
      playerId = byId.id;
      matchedBy = "ngap_id";
      if (nameKey(byId.fullName) !== nameKey(name)) {
        warnings.push({
          row,
          message: `NGAP ID ${ngapId} belongs to "${byId.fullName}" here but "${name}" in the file.`,
        });
      }
    } else {
      const candidates = byName.get(nameKey(name)) ?? [];
      if (candidates.length > 1) {
        return fail(
          `${name}: more than one player has this name. Add an NGAP ID to tell them apart.`,
        );
      }
      const only = candidates[0];
      if (only) {
        if (ngapId && only.ngapId && only.ngapId !== ngapId) {
          return fail(
            `${name}: file says NGAP ID ${ngapId} but the player on file has ${only.ngapId}. Check before importing.`,
          );
        }
        playerId = only.id;
        matchedBy = "name";
      }
    }

    records.push({ row, playerId, name, ngapId, index: idx.value, effectiveDate, matchedBy });
  });

  // The same golfer twice in one file: keep the newest line and say so.
  const latest = new Map<string, ImportRecord>();
  const kept: ImportRecord[] = [];
  for (const r of records) {
    const key = r.playerId ?? (r.ngapId ? `ngap:${r.ngapId}` : `name:${nameKey(r.name)}`);
    const prev = latest.get(key);
    if (!prev) {
      latest.set(key, r);
      kept.push(r);
      continue;
    }
    const newer = r.effectiveDate >= prev.effectiveDate ? r : prev;
    const older = newer === r ? prev : r;
    warnings.push({
      row: older.row,
      message: `${older.name} appears twice. Kept row ${newer.row} (${newer.effectiveDate}) and ignored row ${older.row}.`,
    });
    if (newer === r) {
      kept.splice(kept.indexOf(prev), 1, r);
      latest.set(key, r);
    }
  }

  kept.sort((a, b) => a.row - b.row);
  return {
    records: kept,
    errors,
    warnings,
    summary: {
      total: file.rows.length,
      matched: kept.filter((r) => r.playerId).length,
      newPlayers: kept.filter((r) => !r.playerId).length,
      noHandicap: kept.filter((r) => r.index === null).length,
      errors: errors.length,
    },
  };
}
