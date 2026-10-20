import Papa from "papaparse";
import { normalizeHeader } from "./mapping";
import type { SourceTable } from "./types";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_COLUMNS = 120;

export interface ParsedWorkbook {
  /** Worksheet names in the order the file holds them. */
  sheets: string[];
  sheetName: string;
  table: SourceTable;
  warnings: string[];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value)
    .replace(/^\uFEFF/, "")
    .trim();
}

const HEADER_HINT =
  /name|member|guest|player|surname|golfer|ngap|handicap|birth|gender|contact|email|shirt|paid|game|date/i;

/**
 * Finds the header row. A club workbook often has a title row above the real headers; this picks
 * the first row that looks like labels, and reports the choice so it can be corrected.
 */
function findHeaderIndex(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 12);
  for (let i = 0; i < limit; i += 1) {
    const row = matrix[i] ?? [];
    const nonEmpty = row.filter((cell) => cellText(cell) !== "");
    if (nonEmpty.length < 2) continue;
    if (nonEmpty.some((cell) => HEADER_HINT.test(cellText(cell)))) return i;
  }
  return 0;
}

function uniqueHeaders(values: string[]): string[] {
  const seen = new Map<string, number>();
  return values.map((value, index) => {
    const base = value.trim() || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

export function tableFromMatrix(matrix: unknown[][]): { table: SourceTable; warnings: string[] } {
  if (!matrix.length)
    return { table: { headers: [], rows: [] }, warnings: ["The sheet is empty."] };
  const headerIndex = findHeaderIndex(matrix);
  const headerRow = (matrix[headerIndex] ?? []).map(cellText);
  const width = Math.min(
    Math.max(
      headerRow.filter((h) => h !== "").length,
      ...matrix.slice(headerIndex + 1).map((row) => row.length),
    ),
    MAX_IMPORT_COLUMNS,
  );
  const headers = uniqueHeaders(
    Array.from({ length: width }, (_, i) => headerRow[i] ?? `Column ${i + 1}`),
  );
  const warnings: string[] = [];
  if (headerIndex > 0) {
    warnings.push(
      `The header row was read from row ${headerIndex + 1}; the rows above it were treated as a title.`,
    );
  }
  const rows: string[][] = [];
  for (const row of matrix.slice(headerIndex + 1)) {
    if (!row.some((cell) => cellText(cell) !== "")) continue;
    rows.push(headers.map((_, i) => cellText(row[i])));
    if (rows.length > MAX_IMPORT_ROWS) {
      warnings.push(
        `Only the first ${MAX_IMPORT_ROWS} data rows were read. Split the file to import the rest.`,
      );
      break;
    }
  }
  if (!rows.length) warnings.push("No data rows were found below the header.");
  if (headers.every((h) => /^Column \d+$/.test(h))) {
    warnings.push("The header row is empty; every column will need a manual mapping.");
  }
  return { table: { headers, rows }, warnings };
}

export function parseCsv(buffer: Buffer): ParsedWorkbook {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
  });
  if (result.errors.length) {
    const first = result.errors[0];
    throw new Error(`The CSV could not be read: ${first?.message ?? "unknown error"}.`);
  }
  const { table, warnings } = tableFromMatrix(result.data as unknown[][]);
  return { sheets: ["CSV"], sheetName: "CSV", table, warnings };
}

export async function parseXlsx(
  buffer: Buffer,
  worksheet?: string | null,
): Promise<ParsedWorkbook> {
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const sheets = await readXlsxFile(buffer, { trim: false });
  if (!sheets.length) throw new Error("The workbook has no worksheets.");
  const names = sheets.map((s) => s.sheet);
  const selected = worksheet ? sheets.find((s) => s.sheet === worksheet) : sheets[0];
  if (!selected) {
    throw new Error(`Worksheet "${worksheet}" was not found. Choose one of: ${names.join(", ")}.`);
  }
  const { table, warnings } = tableFromMatrix(selected.data as unknown[][]);
  return { sheets: names, sheetName: selected.sheet, table, warnings };
}

export async function parseWorkbook(
  buffer: Buffer,
  fileName: string,
  worksheet?: string | null,
): Promise<ParsedWorkbook> {
  if (buffer.byteLength === 0) throw new Error("The file is empty.");
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(`The file is larger than ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`);
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return parseXlsx(buffer, worksheet);
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(buffer);
  throw new Error("Choose a .csv or .xlsx file. Convert an .xls file to .xlsx first.");
}

/** A stable key for idempotency: the same file, event and kind returns the committed batch. */
export function idempotencyKey(
  kind: "registration" | "handicap",
  tournamentId: string | null,
  sha: string,
): string {
  return `${kind}:${tournamentId ?? "club"}:${sha}`;
}

/** Headers mapped to a few sample *shapes*, never raw personal data, for an AI proposal. */
export function sampleShapes(table: SourceTable, limit = 5): Record<string, string[]> {
  const shapes: Record<string, string[]> = {};
  for (const header of table.headers) {
    const index = table.headers.indexOf(header);
    const values = table.rows
      .slice(0, limit)
      .map((row) => row[index] ?? "")
      .filter(Boolean);
    shapes[header] = values.map((value) => {
      const text = value.trim();
      if (!text) return "empty";
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "date";
      if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) return "date";
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "email";
      if (/^[+]?[\d\s()-]{7,}$/.test(text)) return "phone";
      if (/^[+-]?\d{1,2}(\.\d{1,2})?$/.test(text)) return "number";
      if (text.length <= 3) return "short";
      if (/day|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct/i.test(text)) return "date words";
      return "text";
    });
  }
  return shapes;
}

/** A lightweight sanity check used by the API to reject a sheet that is obviously not a roster. */
export function looksLikeRoster(table: SourceTable): boolean {
  const headers = table.headers.map(normalizeHeader).join(" ");
  return /name|member|guest|player|golfer|surname/.test(headers) || table.headers.length >= 3;
}
