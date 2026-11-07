import type { Metadata } from "next";
import Link from "next/link";
import { JoinPrintButton, JoinQr } from "@/components/onboarding/JoinQr";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { makeTranslator } from "@/lib/i18n/t";
import { configuredSiteUrl } from "@/lib/public-link";
import styles from "./join.module.css";

export const metadata: Metadata = {
  title: "Join the tournament",
  description:
    "Scan the code, create an account, and find your name on the pairings list. A printable A5 card for the club desk.",
  alternates: { canonical: "/join" },
};

interface LanguageBlock {
  id: string;
  label: string;
  steps: readonly string[];
}

/**
 * The public join card.
 *
 * One card serves both places it is used: on a phone it fills the width, and printed it is a
 * single A5 sheet for the desk. The player half repeats the same three steps in English, Tagalog
 * and Hiligaynon at once, because the person holding the card may read any of the three and the
 * desk should not have to print a separate card per language. The staff half stays in English,
 * which is the working language of the desk.
 */
export default async function JoinPage() {
  const { t } = await getI18n();

  // Built directly from the dictionaries rather than from the request locale: all three languages
  // are shown on the card regardless of the language this visitor is browsing in.
  const tEn = makeTranslator(getDictionary("en"));
  const tTl = makeTranslator(getDictionary("tl"));
  const tHil = makeTranslator(getDictionary("hil"));

  const languages: readonly LanguageBlock[] = [
    {
      id: "en",
      label: tEn("onboard.join.languageEn"),
      steps: [tEn("onboard.join.step1"), tEn("onboard.join.step2"), tEn("onboard.join.step3")],
    },
    {
      id: "tl",
      label: tTl("onboard.join.languageTl"),
      steps: [tTl("onboard.join.step1"), tTl("onboard.join.step2"), tTl("onboard.join.step3")],
    },
    {
      id: "hil",
      label: tHil("onboard.join.languageHil"),
      steps: [tHil("onboard.join.step1"), tHil("onboard.join.step2"), tHil("onboard.join.step3")],
    },
  ];

  // The deployed address wins; the browser origin is only the development fallback. The QR always
  // encodes the app root, so a trailing slash is stripped rather than encoded.
  const configured = configuredSiteUrl();
  const siteUrl = configured ? configured.replace(/\/+$/, "") : undefined;

  return (
    <main className={`public ${styles.join}`}>
      <header className={styles.screenHead}>
        <p className={styles.screenKicker}>TeeLine Golf</p>
        <h1 className={styles.screenTitle}>{t("onboard.join.title")}</h1>
        <p className={styles.screenLede}>{t("onboard.join.lede")}</p>
      </header>

      <JoinPrintButton />

      <article className={styles.card}>
        <header className={styles.cardHead}>
          <div className={styles.brand}>
            <TeeLineLogo variant="light" width={188} className={styles.logoLight} />
            <TeeLineLogo variant="mono" width={188} className={styles.logoMono} />
            <p className={styles.club}>{t("onboard.join.club")}</p>
          </div>
          <h2 className={styles.cardTitle}>{t("onboard.join.title")}</h2>
          <p className={styles.cardLede}>{t("onboard.join.lede")}</p>
        </header>

        <JoinQr configuredSiteUrl={siteUrl} />

        <section className={styles.playerHalf} aria-labelledby="join-players">
          <h3 id="join-players" className={styles.sectionTitle}>
            {t("onboard.join.stepsTitle")}
          </h3>
          <div className={styles.languages}>
            {languages.map((language) => (
              <div key={language.id} className={styles.language}>
                <h4 className={styles.languageLabel}>{language.label}</h4>
                <ol className={styles.steps}>
                  {language.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.staffHalf} aria-labelledby="join-staff">
          <h3 id="join-staff" className={styles.sectionTitle}>
            {t("onboard.join.staffTitle")}
          </h3>
          <p className={styles.staffBody}>{t("onboard.join.staffBody")}</p>
          <Link className={styles.staffLink} href="/login">
            {t("onboard.join.staffAction")}
          </Link>
        </section>
      </article>
    </main>
  );
}
