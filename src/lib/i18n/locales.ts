/**
 * The locales the app speaks, and how a visitor's choice is resolved.
 *
 * English is the source of truth. Tagalog and Hiligaynon are drafts until a native speaker at the
 * club reviews them (see docs/i18n-review.md); the code never claims more than that.
 */
export const LOCALES = ["en", "tl", "hil"] as const;

export type Locale = (typeof LOCALES)[number];

/** The name of each language, written in that language where it differs from English. */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  tl: "Tagalog",
  hil: "Hiligaynon",
};

export const DEFAULT_LOCALE: Locale = "en";

/** The cookie the visitor's choice is remembered in. Client-side convenience only. */
export const LOCALE_COOKIE = "desk-lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Reads a locale out of an `Accept-Language` header. `fil` and `tl` both mean Tagalog; `hil` is
 * Hiligaynon. Quality values are ignored: the first mentioned locale that we speak wins, which is
 * what browsers send anyway.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    if (tag === "") continue;
    const base = tag.split("-")[0] ?? "";
    if (base === "en") return "en";
    if (base === "tl" || base === "fil") return "tl";
    if (base === "hil") return "hil";
  }
  return null;
}

/**
 * The locale for a request: the saved choice first, then the browser's preference, then English.
 * A saved choice always wins, so a player who picked Hiligaynon keeps it even on a borrowed phone
 * until they change it again.
 */
export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}
