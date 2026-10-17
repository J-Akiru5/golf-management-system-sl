import type { ColumnMapping } from "./types";

const SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  name: ["name", "player name", "player", "full name", "member name", "golfer"],
  index: ["index", "handicap index", "hcp index", "handicap", "hi", "whs index"],
  ngapId: [
    "ngap id",
    "ngap no",
    "ngap number",
    "ngap",
    "member id",
    "id",
    "player id",
    "id number",
  ],
  effectiveDate: ["date", "effective date", "as of", "revision date", "rev date", "last revision"],
};

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Suggests a mapping from header text. It only proposes: the organizer confirms in the UI.
 * Returns null for a required field it cannot find, so the UI asks instead of guessing.
 */
export function suggestMapping(headers: string[]): {
  mapping: Partial<ColumnMapping>;
  missing: (keyof ColumnMapping)[];
} {
  const mapping: Partial<ColumnMapping> = {};
  const taken = new Set<string>();
  for (const field of Object.keys(SYNONYMS) as (keyof ColumnMapping)[]) {
    const wanted = SYNONYMS[field];
    // Exact synonym first, in synonym priority order, so "Handicap Index" beats plain "Index".
    for (const synonym of wanted) {
      const hit = headers.find((h) => !taken.has(h) && squash(h) === synonym);
      if (hit) {
        mapping[field] = hit;
        taken.add(hit);
        break;
      }
    }
  }
  const required: (keyof ColumnMapping)[] = ["name", "index"];
  return { mapping, missing: required.filter((f) => !mapping[f]) };
}
