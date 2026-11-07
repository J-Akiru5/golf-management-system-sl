"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { isLocale, LOCALE_COOKIE, LOCALE_LABEL, LOCALES } from "@/lib/i18n/locales";

/**
 * The language list on the profile page: one full-width row per language, so the choice is readable
 * and every row is a large target on a phone.
 *
 * The choice is written to the same cookie the header picker uses and the page is refreshed, so the
 * server renders the new language straight away instead of the client patching text after the fact.
 */
export function LanguageList() {
  const { locale, t } = useI18n();
  const router = useRouter();

  const choose = (value: string) => {
    if (!isLocale(value) || value === locale) return;
    try {
      document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // A browser that refuses cookies still keeps the choice it rendered; the refresh below just
      // resolves the previous locale again.
    }
    router.refresh();
  };

  return (
    <div className="grid gap-2">
      <fieldset className="pf-langs">
        <legend className="sr">{t("profile.language.title")}</legend>
        {LOCALES.map((code) => (
          <label key={code} className="pf-lang">
            <input
              className="pf-lang-input"
              type="radio"
              name="locale"
              value={code}
              checked={code === locale}
              onChange={(event) => choose(event.target.value)}
            />
            <span className="pf-lang-text">
              <b>{LOCALE_LABEL[code]}</b>
            </span>
            {code === locale && <Check className="pf-lang-check size-4" aria-hidden="true" />}
          </label>
        ))}
      </fieldset>
      <p className="pf-hint">{t("profile.language.note")}</p>
    </div>
  );
}
