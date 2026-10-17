import type { FrozenIndex, HandicapRecord } from "./types";

/**
 * Cut-off selection for the tournament desk. Pure functions: the "latest index on or before the
 * cut-off" rule lives here, in one place, so the importer preview, the registration desk and the
 * draw all agree. Nothing is guessed; a missing index stays missing.
 */

export interface IndexSelection {
  /** The record whose index is frozen, or null when nothing is usable. */
  record: HandicapRecord | null;
  /** The numeric index (plus handicaps negative), or null for an NH record. */
  index: number | null;
  /** A later record (after the cut-off) exists; it is not used for this event. */
  newer: HandicapRecord | null;
  /** Why nothing could be selected. Null when a record was found. */
  reason: string | null;
}

const byEffectiveDesc = (a: HandicapRecord, b: HandicapRecord) =>
  b.effectiveDate.localeCompare(a.effectiveDate) || b.recordedAt.localeCompare(a.recordedAt);

/** Picks the latest record on or before the cut-off for one player. */
export function selectIndexForCutOff(
  records: HandicapRecord[],
  cutOffDate: string,
): IndexSelection {
  const onOrBefore = records.filter((r) => r.effectiveDate <= cutOffDate).sort(byEffectiveDesc);
  const after = records.filter((r) => r.effectiveDate > cutOffDate).sort(byEffectiveDesc);
  const record = onOrBefore[0] ?? null;
  const newer = after[0] ?? null;
  if (!record) {
    return {
      record: null,
      index: null,
      newer,
      reason:
        newer === null
          ? `No NGAP record on or before the cut-off (${cutOffDate}).`
          : `No record on or before the cut-off (${cutOffDate}). The newest record is dated ${newer.effectiveDate}.`,
    };
  }
  if (record.index === null) {
    return {
      record,
      index: null,
      newer,
      reason: `The NGAP record dated ${record.effectiveDate} shows no handicap (NH).`,
    };
  }
  return { record, index: record.index, newer, reason: null };
}

/** Copies the selection onto a registration so later imports cannot move it. */
export function freezeIndex(selection: IndexSelection, at: string): FrozenIndex {
  return {
    index: selection.index,
    recordId: selection.record?.id ?? null,
    effectiveDate: selection.record?.effectiveDate ?? null,
    frozenAt: at,
  };
}

/** Whole days between two ISO dates (b minus a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  if (!ay || !am || !ad || !by || !bm || !bd) return 0;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** True when the frozen record is older than the event's allowance. */
export function isStale(
  selection: IndexSelection,
  cutOffDate: string,
  staleIndexDays: number,
): boolean {
  if (!selection.record) return false;
  return daysBetween(selection.record.effectiveDate, cutOffDate) > staleIndexDays;
}

/** True when the records now say something different from what the entry froze. */
export function frozenOutdated(frozen: FrozenIndex, selection: IndexSelection): boolean {
  const recordId = selection.record?.id ?? null;
  const index = selection.index;
  return frozen.recordId !== recordId || frozen.index !== index;
}
