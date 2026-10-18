export { getDictionary } from "./dictionaries";
export type { Dictionary } from "./dictionaries/en";
export {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_LABEL,
  LOCALES,
  type Locale,
  localeFromAcceptLanguage,
  resolveLocale,
} from "./locales";
export {
  interpolate,
  makeTranslator,
  type Translate,
  type TranslationKey,
  type TranslationVars,
  t,
} from "./t";
