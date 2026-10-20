/**
 * Date and playing-day parsing for imported workbooks.
 *
 * These are deliberately conservative. A value that cannot be read is an error with the original
 * text quoted, never a guessed date. The operator can correct the cell or change the date format.
 */

export type DateFormat = "mdy" | "dmy" | "iso";

export interface DateParse {
  ok: boolean;
  value: string | null;
  message?: string;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_PATTERN =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

function expandYear(value: number): number {
  if (value >= 100) return value;
  return value >= 30 ? 1900 + value : 2000 + value;
}

/** Excel stores dates as days since 1899-12-30 (the 1900 leap-year bug is already accounted for). */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return null;
  const ms = Math.round(serial) * 86_400_000 + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function fromParts(first: number, second: number, year: number, format: DateFormat): string | null {
  if (format === "dmy") return isoDate(year, second, first);
  return isoDate(year, first, second);
}

/**
 * Reads a date cell or string. `format` only decides the ambiguous `3/4/2026` case; ISO and dates
 * with a month name are unambiguous.
 */
export function parseDateValue(value: unknown, format: DateFormat = "mdy"): DateParse {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { ok: false, value: null, message: "Invalid date." };
    return {
      ok: true,
      value: isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()),
    };
  }
  if (typeof value === "number") {
    const iso = excelSerialToIso(value);
    return iso
      ? { ok: true, value: iso }
      : { ok: false, value: null, message: `"${value}" is not a readable date.` };
  }

  const text = String(value)
    .trim()
    .replace(/\u00a0/g, " ");
  if (!text) return { ok: true, value: null };

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const parsed = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return parsed
      ? { ok: true, value: parsed }
      : { ok: false, value: null, message: `"${text}" is not a real date.` };
  }

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const parsed = fromParts(
      Number(slash[1]),
      Number(slash[2]),
      expandYear(Number(slash[3])),
      format === "dmy" ? "dmy" : "mdy",
    );
    return parsed
      ? { ok: true, value: parsed }
      : { ok: false, value: null, message: `"${text}" is not a real date.` };
  }

  const yearFirst = text.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
  if (yearFirst) {
    const parsed = isoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
    return parsed
      ? { ok: true, value: parsed }
      : { ok: false, value: null, message: `"${text}" is not a real date.` };
  }

  const monthFirst = text.match(
    new RegExp(`^${MONTH_PATTERN}[\\s.-]+(\\d{1,2})(?:st|nd|rd|th)?[,\\s.-]+(\\d{2,4})$`, "i"),
  );
  if (monthFirst) {
    const month = MONTHS[monthFirst[1]?.toLowerCase() ?? ""];
    const parsed = month
      ? isoDate(expandYear(Number(monthFirst[3])), month, Number(monthFirst[2]))
      : null;
    return parsed
      ? { ok: true, value: parsed }
      : { ok: false, value: null, message: `"${text}" is not a real date.` };
  }

  const dayFirst = text.match(
    new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?[\\s.-]+${MONTH_PATTERN}[,\\s.-]+(\\d{2,4})$`, "i"),
  );
  if (dayFirst) {
    const month = MONTHS[dayFirst[2]?.toLowerCase() ?? ""];
    const parsed = month
      ? isoDate(expandYear(Number(dayFirst[3])), month, Number(dayFirst[1]))
      : null;
    return parsed
      ? { ok: true, value: parsed }
      : { ok: false, value: null, message: `"${text}" is not a real date.` };
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = excelSerialToIso(Number(text));
    if (serial) return { ok: true, value: serial };
  }

  return { ok: false, value: null, message: `"${text}" is not a readable date.` };
}

export interface DaySelectionParse {
  /** Day numbers, unique and sorted. */
  days: number[];
  uncertain: boolean;
  note: string | null;
}

interface DayRef {
  dayNumber: number;
  playDate: string;
}

function monthDay(iso: string): { month: number; day: number } | null {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { month: Number(m[1]), day: Number(m[2]) };
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function dayForDate(days: DayRef[], month: number, day: number): number | null {
  return (
    days.find((d) => monthDay(d.playDate)?.month === month && monthDay(d.playDate)?.day === day)
      ?.dayNumber ?? null
  );
}

/**
 * Turns the free-text GAME DATES cell into structured day numbers.
 *
 * Supported forms include "Day 1 & 2", "D1, D2", "Nov 12-14", "11/12/2026", "12-13", "all days".
 * A count without identifiers ("2 days") is deliberately uncertain: it does not say which two.
 */
export function parseDaySelection(
  value: unknown,
  days: DayRef[],
  format: DateFormat = "mdy",
): DaySelectionParse {
  const text = String(value ?? "")
    .trim()
    .replace(/\u00a0/g, " ");
  const playing = days.filter((d) => d.dayNumber > 0);
  if (!text) return { days: [], uncertain: false, note: null };
  if (!playing.length) {
    return { days: [], uncertain: true, note: "This event has no playing days yet." };
  }

  const lower = text.toLowerCase();
  if (/\b(all|every|whole|entire)\b/.test(lower) && /\b(day|days|event)\b/.test(lower)) {
    return {
      days: uniqueSorted(playing.map((d) => d.dayNumber)),
      uncertain: false,
      note: "All playing days.",
    };
  }
  if (lower === "all") {
    return {
      days: uniqueSorted(playing.map((d) => d.dayNumber)),
      uncertain: false,
      note: "All playing days.",
    };
  }

  // A count without identifiers is a question, not a set of days.
  if (/^\s*(\d{1,2})\s*(days?|rounds?)\s*$/.test(lower)) {
    return {
      days: [],
      uncertain: true,
      note: "The cell says how many days, not which days. Choose the days.",
    };
  }

  const found = new Set<number>();
  let remainder = lower;
  const monthName = MONTHS;

  // A month-prefixed range: "Nov 12-14" means three dates, not a date followed by 14.
  const monthRange = lower.match(
    new RegExp(
      `\\b${MONTH_PATTERN}[\\s.-]+(\\d{1,2})(?:st|nd|rd|th)?\\s*[-–]\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`,
      "i",
    ),
  );
  if (monthRange) {
    const month = monthName[monthRange[1]?.toLowerCase() ?? ""];
    const start = Number(monthRange[2]);
    const end = Number(monthRange[3]);
    if (month && start <= end) {
      for (let n = start; n <= end; n += 1) {
        const day = dayForDate(playing, month, n);
        if (day) found.add(day);
      }
    }
    remainder = remainder.replace(monthRange[0], " ");
  }

  // Explicit day labels: "Day 1", "D2", "1st day".
  for (const match of lower.matchAll(/\b(?:day|d)\s*([0-9]{1,2})\b/g)) {
    const n = Number(match[1]);
    if (playing.some((d) => d.dayNumber === n)) found.add(n);
    remainder = remainder.replace(match[0], " ");
  }
  for (const match of lower.matchAll(/\b([0-9]{1,2})\s*(?:st|nd|rd|th)?\s*day\b/g)) {
    const n = Number(match[1]);
    if (playing.some((d) => d.dayNumber === n)) found.add(n);
    remainder = remainder.replace(match[0], " ");
  }

  // ISO dates.
  for (const match of lower.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const iso = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) {
      const m = monthDay(iso);
      const n = m ? dayForDate(playing, m.month, m.day) : null;
      if (n) found.add(n);
    }
    remainder = remainder.replace(match[0], " ");
  }

  // "Nov 12", "12 November", with an optional year.
  const monthFirst = new RegExp(`\\b${MONTH_PATTERN}[\\s.-]+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi");
  for (const match of lower.matchAll(monthFirst)) {
    const month = monthName[match[1]?.toLowerCase() ?? ""];
    const n = month ? dayForDate(playing, month, Number(match[2])) : null;
    if (n) found.add(n);
    remainder = remainder.replace(match[0], " ");
  }
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s.-]+${MONTH_PATTERN}\\b`, "gi");
  for (const match of lower.matchAll(dayFirst)) {
    const month = monthName[match[2]?.toLowerCase() ?? ""];
    const n = month ? dayForDate(playing, month, Number(match[1])) : null;
    if (n) found.add(n);
    remainder = remainder.replace(match[0], " ");
  }

  // Numeric dates: 11/12, 11-12. Only treat as a date when the event actually has that month/day.
  for (const match of lower.matchAll(/\b(\d{1,2})[/-](\d{1,2})\b/g)) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    const asMdy = dayForDate(playing, format === "dmy" ? b : a, format === "dmy" ? a : b);
    const asDmy = dayForDate(playing, format === "dmy" ? a : b, format === "dmy" ? b : a);
    const n = asMdy ?? asDmy;
    if (n) found.add(n);
    if (n) remainder = remainder.replace(match[0], " ");
  }

  // Ranges of day numbers, or of dates within one month: "1-2", "Nov 12-14", "12-14".
  const range = remainder.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    const dateRange: number[] = [];
    for (let n = start; n <= end; n += 1) {
      for (const d of playing) {
        const md = monthDay(d.playDate);
        if (md && md.day === n) dateRange.push(d.dayNumber);
      }
    }
    if (dateRange.length) {
      for (const n of dateRange) found.add(n);
    } else if (start <= end) {
      for (let n = start; n <= end; n += 1) {
        if (playing.some((d) => d.dayNumber === n)) found.add(n);
      }
    }
    remainder = remainder.replace(range[0], " ");
  }

  // Simple lists: "12, 13" or "12 & 13" are dates when they match a day; otherwise day numbers.
  for (const match of remainder.matchAll(/\b(\d{1,2})\b/g)) {
    const n = Number(match[1]);
    const asDay = playing.find((d) => d.dayNumber === n)?.dayNumber;
    const asDate = playing.find((d) => monthDay(d.playDate)?.day === n)?.dayNumber;
    const chosen = asDate ?? asDay;
    if (chosen) {
      found.add(chosen);
      remainder = remainder.replace(match[0], " ");
    }
  }

  const leftover = remainder
    .replace(
      /\b(and|to|until|thru|through|of|on|the|days?|dates?|game|play|playing|selected|only|from)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const countOnly = /^\s*(\d{1,2})\s*(days?|rounds?)\s*$/.test(lower);
  const uncertain = found.size === 0 || (leftover.length > 0 && !countOnly);
  const noteParts: string[] = [];
  if (found.size) noteParts.push(`Read as Day ${[...found].sort((a, b) => a - b).join(", Day ")}.`);
  if (countOnly) noteParts.push("The cell says how many days, not which days. Choose the days.");
  if (leftover && !countOnly) noteParts.push(`Could not read: "${leftover}".`);

  return { days: uniqueSorted([...found]), uncertain, note: noteParts.join(" ") || null };
}
