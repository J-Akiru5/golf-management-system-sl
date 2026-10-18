import { cookies, headers } from "next/headers";
import { getDictionary } from "./dictionaries";
import { LOCALE_COOKIE, type Locale, resolveLocale } from "./locales";
import { makeTranslator, type Translate } from "./t";

export interface I18n {
  locale: Locale;
  t: Translate;
}

/**
 * The locale for this request: the saved cookie first, then the browser's `Accept-Language`, then
 * English. Server components call this once and pass the translator down; the root layout also
 * hands the locale to the client provider so client components agree with what was rendered.
 */
export async function getI18n(): Promise<I18n> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get("accept-language"),
  );
  return { locale, t: makeTranslator(getDictionary(locale)) };
}
