import { type Dictionary, en } from "./dictionaries/en";

/**
 * Typed translation keys, derived from the English dictionary. A key that does not exist is a
 * compile error, and `makeTranslator` never throws at runtime: a missing string falls back to
 * English and then to the key itself, so a draft locale can never blank out a screen.
 */
type LeafKeys<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : LeafKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = LeafKeys<Dictionary>;

export type TranslationVars = Record<string, string | number | null | undefined>;

export type Translate = (key: TranslationKey, vars?: TranslationVars) => string;

const lookup = (dict: unknown, path: string): string | null => {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : null;
};

/** Replaces `{name}` with the value given, and leaves the placeholder when nothing was passed. */
export function interpolate(template: string, vars: TranslationVars = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/** A translator bound to one locale, with English as the fallback behind it. */
export function makeTranslator(dict: Dictionary): Translate {
  return (key, vars) => interpolate(lookup(dict, key) ?? lookup(en, key) ?? key, vars);
}

/** The English translator, for tests and for code paths that have no locale yet. */
export const t: Translate = makeTranslator(en);
