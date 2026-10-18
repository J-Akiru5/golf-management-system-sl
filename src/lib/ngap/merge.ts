import { nameKey, parseDate, parseIndex } from "./normalize";
import type { ImportOptions, KnownPlayer, ParsedFile, RowIssue } from "./types";

/**
 * The import review queue. It is the honest middle step between "a file arrived" and "the records
 * changed": every row carries what it matched, how sure that is, and what the organizer must
 * decide. Nothing is merged silently, and a row with an unclear match stays a question rather than
 * a guess. Pure: no state, no network.
 */

export type Confidence = "exact" | "strong" | "weak";

export interface MatchSignal {
  kind: "ngap_id" | "name" | "dob" | "contact";
  detail: string;
}

export interface MatchCandidate {
  playerId: string;
  fullName: string;
  ngapId: string | null;
  confidence: Confidence;
  signals: MatchSignal[];
  /** Soft doubts. They are shown, but the row can still be linked. */
  warnings: string[];
  /** Hard doubts. The organizer must decide before the row is applied. */
  conflicts: string[];
}

export interface MergeRow {
  row: number;
  name: string;
  ngapId: string | null;
  index: number | null;
  effectiveDate: string;
  candidates: MatchCandidate[];
  /** Hard conflicts gathered from the row and its candidates. */
  conflicts: string[];
  /** Soft doubts gathered from the row and its candidates. */
  warnings: string[];
  recommendation: "link" | "create" | "review";
  matchedBy: "ngap_id" | "name" | "none";
  /** True for the older of two lines for the same golfer; it is skipped. */
  skip: boolean;
}

export interface MergeQueue {
  rows: MergeRow[];
  errors: RowIssue[];
  warnings: RowIssue[];
  summary: {
    total: number;
    link: number;
    create: number;
    decisions: number;
    skipped: number;
    errors: number;
  };
}

const digits = (s: string) => s.replace(/[^\d]/g, "");

const requiredColumns = (mapping: ImportOptions["mapping"]) =>
  [mapping.name, mapping.index, mapping.ngapId, mapping.effectiveDate, mapping.dob, mapping.contact]
    .filter((c): c is string => Boolean(c))
    .filter((c) => c.length > 0);

export function buildMergeQueue(
  file: ParsedFile,
  known: KnownPlayer[],
  options: ImportOptions,
): MergeQueue {
  const { mapping, dateFormat, defaultEffectiveDate } = options;
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  const missingColumns = requiredColumns(mapping).filter((c) => !file.headers.includes(c));
  if (missingColumns.length > 0) {
    throw new Error(`Column(s) not found in the file: ${missingColumns.join(", ")}`);
  }

  const rows: MergeRow[] = [];

  file.rows.forEach((raw, i) => {
    const row = i + 1;
    const name = (raw[mapping.name] ?? "").trim();
    if (!name) return errors.push({ row, message: "Name is empty." });

    const idRaw = mapping.ngapId ? (raw[mapping.ngapId] ?? "").trim() : "";
    const ngapId = idRaw === "" ? null : idRaw;

    const idx = parseIndex(raw[mapping.index] ?? "");
    if (!idx.ok) return errors.push({ row, message: `${name}: ${idx.message}` });

    let effectiveDate = defaultEffectiveDate;
    if (mapping.effectiveDate) {
      const d = parseDate(raw[mapping.effectiveDate] ?? "", dateFormat);
      if (!d.ok) return errors.push({ row, message: `${name}: ${d.message}` });
      effectiveDate = d.value;
    }

    let dob: string | null = null;
    if (mapping.dob) {
      const text = (raw[mapping.dob] ?? "").trim();
      if (text) {
        const d = parseDate(text, dateFormat);
        if (d.ok) dob = d.value;
      }
    }
    const contact = mapping.contact ? (raw[mapping.contact] ?? "").trim() || null : null;

    const key = nameKey(name);
    const byId = ngapId ? known.filter((k) => k.ngapId === ngapId) : [];
    const byName = known.filter((k) => nameKey(k.fullName) === key);
    const candidateIds = [...new Set([...byId.map((k) => k.id), ...byName.map((k) => k.id)])];

    const candidates: MatchCandidate[] = candidateIds.flatMap((id) => {
      const k = known.find((x) => x.id === id);
      if (!k) return [];
      const viaId = byId.some((x) => x.id === id);
      const viaName = byName.some((x) => x.id === id);
      const signals: MatchSignal[] = [];
      const soft: string[] = [];
      const hard: string[] = [];

      if (viaId) signals.push({ kind: "ngap_id", detail: `NGAP ID ${ngapId} is on this record` });
      if (viaName) signals.push({ kind: "name", detail: `Name matches "${k.fullName}"` });
      if (dob && k.birthdate) {
        if (dob === k.birthdate)
          signals.push({ kind: "dob", detail: `Birthdate matches (${dob})` });
        else
          hard.push(
            `birthdate on the record is ${k.birthdate} but the file says ${dob}. Check before importing.`,
          );
      }
      if (contact && k.contactNumber) {
        const a = digits(contact);
        const b = digits(k.contactNumber);
        if (a.length >= 7 && a === b)
          signals.push({ kind: "contact", detail: "Contact number matches" });
      }
      if (viaId && nameKey(k.fullName) !== key) {
        soft.push(`NGAP ID ${ngapId} belongs to "${k.fullName}" here but "${name}" in the file.`);
      }
      if (!viaId && ngapId && k.ngapId && k.ngapId !== ngapId) {
        hard.push(
          `file says NGAP ID ${ngapId} but the player on file has ${k.ngapId}. Check before importing.`,
        );
      }

      const confidence: Confidence = viaId
        ? hard.length > 0
          ? "strong"
          : "exact"
        : hard.length > 0
          ? "weak"
          : "strong";
      return [
        {
          playerId: id,
          fullName: k.fullName,
          ngapId: k.ngapId,
          confidence,
          signals,
          warnings: soft,
          conflicts: hard,
        },
      ];
    });

    const conflicts: string[] = [];
    const rowWarnings: string[] = [];
    if (candidates.length > 1) {
      conflicts.push("more than one player has this name. Add an NGAP ID to tell them apart.");
    }
    for (const c of candidates) {
      conflicts.push(...c.conflicts);
      rowWarnings.push(...c.warnings);
    }

    const recommendation: MergeRow["recommendation"] =
      candidates.length === 0
        ? "create"
        : candidates.length === 1 && conflicts.length === 0
          ? "link"
          : "review";

    rows.push({
      row,
      name,
      ngapId,
      index: idx.value,
      effectiveDate,
      candidates,
      conflicts,
      warnings: rowWarnings,
      recommendation,
      matchedBy: candidates.length === 0 ? "none" : byId.length > 0 ? "ngap_id" : "name",
      skip: false,
    });
  });

  // The same golfer twice in one file: keep the newest line and say so.
  // A row with a hard conflict is a question for the organizer, not a repeated line.
  const latest = new Map<string, MergeRow>();
  for (const r of rows) {
    if (r.conflicts.length > 0) continue;
    const first = r.candidates[0];
    const dupKey = first
      ? `player:${first.playerId}`
      : r.ngapId
        ? `ngap:${r.ngapId}`
        : `name:${nameKey(r.name)}`;
    const prev = latest.get(dupKey);
    if (!prev) {
      latest.set(dupKey, r);
      continue;
    }
    const [newer, older] = r.effectiveDate >= prev.effectiveDate ? [r, prev] : [prev, r];
    older.skip = true;
    warnings.push({
      row: older.row,
      message: `${older.name} appears twice. Kept row ${newer.row} (${newer.effectiveDate}) and ignored row ${older.row}.`,
    });
    latest.set(dupKey, newer);
  }

  const live = rows.filter((r) => !r.skip);
  return {
    rows,
    errors,
    warnings,
    summary: {
      total: file.rows.length,
      link: live.filter((r) => r.recommendation === "link").length,
      create: live.filter((r) => r.recommendation === "create").length,
      decisions: live.filter((r) => r.recommendation === "review").length,
      skipped: rows.length - live.length,
      errors: errors.length,
    },
  };
}

export type MergeAction = "link" | "create" | "separate" | "defer";

export interface MergeDecision {
  row: number;
  action: MergeAction;
  /** Required for "link"; ignored otherwise. */
  playerId?: string;
}

export interface ResolvedImportRow {
  row: number;
  name: string;
  ngapId: string | null;
  index: number | null;
  effectiveDate: string;
  /** The player to write the record against, or null when a new record is created. */
  playerId: string | null;
  createNew: boolean;
  action: MergeAction;
}

export interface Resolution {
  rows: ResolvedImportRow[];
  /** Rows the organizer chose to decide later. They keep their place in the queue. */
  deferred: MergeRow[];
  /** Rows that still need a decision before they can be applied. */
  unresolved: MergeRow[];
}

/** Applies the organizer's decisions to the queue. No decision is invented here. */
export function resolveImport(queue: MergeQueue, decisions: MergeDecision[]): Resolution {
  const byRow = new Map(decisions.map((d) => [d.row, d]));
  const rows: ResolvedImportRow[] = [];
  const deferred: MergeRow[] = [];
  const unresolved: MergeRow[] = [];

  for (const r of queue.rows) {
    if (r.skip) continue;
    const decision = byRow.get(r.row);
    const base = {
      row: r.row,
      name: r.name,
      ngapId: r.ngapId,
      index: r.index,
      effectiveDate: r.effectiveDate,
    };
    const top = r.candidates[0];
    if (decision?.action === "defer" || (!decision && r.recommendation === "review")) {
      if (decision?.action === "defer") deferred.push(r);
      else unresolved.push(r);
      continue;
    }
    if (decision?.action === "link") {
      // With more than one candidate the organizer must name the player; the queue never picks one.
      const playerId =
        decision.playerId ?? (r.candidates.length === 1 ? r.candidates[0]?.playerId : undefined);
      if (!playerId) {
        unresolved.push(r);
        continue;
      }
      rows.push({ ...base, playerId, createNew: false, action: "link" });
      continue;
    }
    if (decision?.action === "create" || decision?.action === "separate") {
      rows.push({ ...base, playerId: null, createNew: true, action: decision.action });
      continue;
    }
    if (r.recommendation === "link" && top) {
      rows.push({ ...base, playerId: top.playerId, createNew: false, action: "link" });
    } else {
      rows.push({ ...base, playerId: null, createNew: true, action: "create" });
    }
  }

  return { rows, deferred, unresolved };
}
