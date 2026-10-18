"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { getDictionary } from "./dictionaries";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { makeTranslator, type Translate } from "./t";

interface I18nValue {
  locale: Locale;
  t: Translate;
}

const fallback: I18nValue = {
  locale: DEFAULT_LOCALE,
  t: makeTranslator(getDictionary(DEFAULT_LOCALE)),
};

const I18nContext = createContext<I18nValue>(fallback);

/**
 * Gives client components the same locale the server rendered with. The locale comes from a cookie
 * (see getI18n); changing it writes the cookie and refreshes, so client and server never disagree.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({ locale, t: makeTranslator(getDictionary(locale)) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
