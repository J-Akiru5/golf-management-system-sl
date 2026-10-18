"use client";

import { useMemo, useState } from "react";
import { DESK_GUIDES, PLAYER_GUIDES } from "@/lib/help/guides";
import { helpText } from "@/lib/help/types";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { LOCALE_LABEL, LOCALES, type Locale } from "@/lib/i18n/locales";
import { makeTranslator } from "@/lib/i18n/t";

/**
 * The printable cheat sheet: one page for the desk, one for players.
 *
 * The desk page is English, like the desk chrome (decision 18). The player page prints in whichever
 * language is picked here, so the club can pin the Hiligaynon or Tagalog version on the clubhouse
 * board without needing a language switcher on a desk screen.
 */
export function CheatSheet() {
  const [locale, setLocale] = useState<Locale>("en");
  const t = useMemo(() => makeTranslator(getDictionary(locale)), [locale]);

  return (
    <div className="grid gap-6">
      <div className="no-print flex flex-wrap items-center gap-4">
        <label className="field !w-auto">
          <span>Player sheet language</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            aria-label="Language of the player sheet"
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABEL[code]}
              </option>
            ))}
          </select>
        </label>
        <p className="hint max-w-[46ch]">
          The desk page below stays English. The player page prints in the language picked here, so
          the same sheet can go up in Tagalog or Hiligaynon.
        </p>
      </div>

      <section className="grid gap-2">
        <h2 className="text-[20px]">The desk, screen by screen</h2>
        <ol className="grid list-decimal gap-3 pl-6">
          {DESK_GUIDES.map((guide) => (
            <li key={guide.id} className="grid gap-1">
              <b>{helpText(guide.title, t)}</b>
              {guide.summary && <span className="hint">{helpText(guide.summary, t)}</span>}
              <ol className="grid list-decimal gap-1 pl-5 text-[13px] leading-5">
                {guide.steps.map((step, index) => (
                  <li key={index}>{helpText(step.text, t)}</li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-2">
        <h2 className="text-[20px]">
          Players, screen by screen <span className="hint">({LOCALE_LABEL[locale]})</span>
        </h2>
        <ol className="grid list-decimal gap-3 pl-6">
          {PLAYER_GUIDES.map((guide) => (
            <li key={guide.id} className="grid gap-1">
              <b>{helpText(guide.title, t)}</b>
              {guide.summary && <span className="hint">{helpText(guide.summary, t)}</span>}
              <ol className="grid list-decimal gap-1 pl-5 text-[13px] leading-5">
                {guide.steps.map((step, index) => (
                  <li key={index}>{helpText(step.text, t)}</li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
