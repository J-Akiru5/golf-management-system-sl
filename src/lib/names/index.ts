/**
 * Player names: one place for how a name is written, split and searched.
 *
 * The club writes a player as "SURNAME, GIVEN NAMES". Older records were typed given-name first,
 * and the search boxes compared raw strings, so "ronnel adorio", "tanada" and "ADORIO,RONNEL" all
 * missed the same person. This module is pure: no I/O, so it is safe to use anywhere.
 */

/** Drops accents so "TAÑADA" and "tanada" compare equal. Ñ becomes N, Á becomes A. */
export function foldAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Cleans spacing around a name without changing the order of its words: one space between words,
 * ", " after the surname, no trailing comma, capitals. "braga,nonoy" -> "BRAGA, NONOY".
 */
export function tidyName(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^,\s*|,\s*$/g, "")
    .trim()
    .toUpperCase();
}

export interface ParsedName {
  surname: string;
  given: string;
  /** True when the name was written "SURNAME, GIVEN", so the split is certain. */
  certain: boolean;
}

/**
 * Splits a stored name. With a comma the part before it is the surname. Without one the order is
 * not known, so the last word is taken as the surname (the old rule) and `certain` is false.
 */
export function parseName(full: string): ParsedName {
  const tidy = full.replace(/^﻿/, "").replace(/\s+/g, " ").trim();
  const comma = tidy.indexOf(",");
  if (comma >= 0) {
    return {
      surname: tidy.slice(0, comma).trim(),
      given: tidy
        .slice(comma + 1)
        .replace(/,/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      certain: true,
    };
  }
  const words = tidy.split(" ").filter(Boolean);
  if (words.length < 2) return { surname: words[0] ?? "", given: "", certain: false };
  return { surname: words.at(-1) ?? "", given: words.slice(0, -1).join(" "), certain: false };
}

/** The canonical stored form: "SURNAME, GIVEN". A missing half is left out, never invented. */
export function formatName(given: string, surname: string): string {
  const g = given.replace(/\s+/g, " ").trim();
  const s = surname.replace(/\s+/g, " ").trim();
  if (g && s) return tidyName(`${s}, ${g}`);
  return tidyName(s || g);
}

/**
 * What a search compares: capitals and accents gone, punctuation turned into spaces.
 * "TAÑADA, JOSE LEONARDO" -> "tanada jose leonardo".
 */
export function searchKey(text: string | null | undefined): string {
  return foldAccents(text ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * True when every word the user typed appears in one of the fields, in any order and ignoring
 * accents, case and punctuation. An empty query matches everything.
 */
export function matchesText(
  fields: ReadonlyArray<string | null | undefined> | string | null | undefined,
  query: string,
): boolean {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const list = Array.isArray(fields) ? fields : [fields as string | null | undefined];
  return list.some((field) => {
    const key = searchKey(field);
    return words.every((word) => key.includes(word));
  });
}
