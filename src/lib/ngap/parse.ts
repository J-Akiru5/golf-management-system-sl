import Papa from "papaparse";
import type { ParsedFile } from "./types";

/** Reads CSV text. Headers are trimmed; a leading byte-order mark (common in Excel exports) is removed. */
export function parseCsv(text: string): ParsedFile {
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });
  const fatal = result.errors.find((e) => e.type === "Delimiter" || e.type === "Quotes");
  if (fatal) throw new Error(`Could not read the file as CSV: ${fatal.message}`);
  return { headers: result.meta.fields ?? [], rows: result.data };
}
