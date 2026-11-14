/**
 * The one rule for a manually entered handicap record.
 *
 * The date is the key: one record per player per effective date, the same rule the table's
 * `unique (player_id, effective_date)` keeps. Saving an existing date corrects that record; a new
 * date adds one. Nothing is estimated, so every field is required.
 *
 * Pure functions, shared by the sheet and the tests.
 */

export const HANDICAP_INDEX_MIN = -10;
export const HANDICAP_INDEX_MAX = 54;
export const HANDICAP_REASON_MIN = 3;

/** A record the desk may write. `index` is the stored number, plus handicaps negative. */
export interface HandicapRecordInput {
  index: number;
  /** ISO effective date of the revision. */
  effectiveDate: string;
  /** Why the record was added or corrected. */
  reason: string;
}

/** The raw values of the sheet, before they are read. */
export interface HandicapRecordFormValues {
  index: string;
  effectiveDate: string;
  reason: string;
}

export type HandicapRecordFormResult =
  | { ok: true; value: HandicapRecordInput }
  | { ok: false; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as YYYY-MM-DD, not just any four-two-two shape. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  if (!yearText || !monthText || !dayText) return false;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Reads the sheet. The index must be one decimal in the range the database column accepts, the date
 * must be a real ISO date, and the reason must say why in at least three characters.
 */
export function readHandicapRecordForm(values: HandicapRecordFormValues): HandicapRecordFormResult {
  const indexText = values.index.trim();
  if (indexText === "") {
    return { ok: false, message: "Enter a handicap index." };
  }
  const index = Number(indexText);
  if (!Number.isFinite(index) || index < HANDICAP_INDEX_MIN || index > HANDICAP_INDEX_MAX) {
    return {
      ok: false,
      message: `The handicap index must be a number from ${HANDICAP_INDEX_MIN} to ${HANDICAP_INDEX_MAX}.`,
    };
  }
  // numeric(4,1) stores one decimal; refusing a second one here means the desk sees the number it
  // will keep, instead of a value the database quietly rounds.
  if (Math.abs(index * 10 - Math.round(index * 10)) > 1e-9) {
    return { ok: false, message: "Use one decimal place for the handicap index." };
  }
  if (!isIsoDate(values.effectiveDate)) {
    return { ok: false, message: "Choose the effective date as a real date." };
  }
  const reason = values.reason.trim();
  if (reason.length < HANDICAP_REASON_MIN) {
    return {
      ok: false,
      message: `Enter a reason of at least ${HANDICAP_REASON_MIN} characters.`,
    };
  }
  return { ok: true, value: { index, effectiveDate: values.effectiveDate, reason } };
}
