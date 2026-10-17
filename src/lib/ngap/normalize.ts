import type { DateFormat } from "./types";

/** Lowest and highest WHS handicap index. */
export const MIN_INDEX = -10;
export const MAX_INDEX = 54;

export type IndexResult = { ok: true; value: number | null } | { ok: false; message: string };

/**
 * Reads a handicap index cell.
 *   "14.2"  -> 14.2        "14,2" -> 14.2 (comma decimal)
 *   "+2.3"  -> -2.3        (a plus handicap is better than scratch, stored as a negative number)
 *   "NH", "N/A", "" -> null (no handicap)
 */
export function parseIndex(raw: string): IndexResult {
  const text = raw.trim().replace(",", ".");
  if (text === "" || /^(nh|n\/a|na|-|--)$/i.test(text)) return { ok: true, value: null };
  const plus = text.startsWith("+");
  const body = plus ? text.slice(1) : text;
  if (!/^-?\d{1,2}(\.\d)?$/.test(body)) {
    return { ok: false, message: `"${raw}" is not a handicap index.` };
  }
  let value = Number(body);
  if (plus) value = -Math.abs(value);
  if (value < MIN_INDEX || value > MAX_INDEX) {
    return { ok: false, message: `Index ${value} is outside ${MIN_INDEX} to ${MAX_INDEX}.` };
  }
  return { ok: true, value };
}

export type DateResult = { ok: true; value: string } | { ok: false; message: string };

function validIso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Reads a date cell into YYYY-MM-DD. Slash dates follow the format the organizer chose. */
export function parseDate(raw: string, format: DateFormat): DateResult {
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const v = validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return v ? { ok: true, value: v } : { ok: false, message: `"${raw}" is not a real date.` };
  }
  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (slash && format !== "iso") {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [m, d] = format === "mdy" ? [a, b] : [b, a];
    const v = validIso(Number(slash[3]), m, d);
    return v
      ? { ok: true, value: v }
      : { ok: false, message: `"${raw}" is not a real date as ${format.toUpperCase()}.` };
  }
  return { ok: false, message: `"${raw}" is not a date this import can read.` };
}

/**
 * Name key that ignores order, case, accents and punctuation, so
 * "DELA CRUZ, Juan P." and "Juan P. Dela Cruz" produce the same key.
 */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}
