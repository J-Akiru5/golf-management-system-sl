import type { Locale } from "../locales";
import { en } from "./en";
import { hil } from "./hil";
import { tl } from "./tl";

/**
 * Every dictionary, keyed by locale. Each one is typed as `Dictionary`, so a missing or misspelled
 * key is a compile error rather than a silent English fallback on screen.
 */
const DICTIONARIES: Record<Locale, typeof en> = { en, tl, hil };

export function getDictionary(locale: Locale): typeof en {
  return DICTIONARIES[locale] ?? en;
}
