"use client";

import { Download, Smartphone } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { LOCALE_LABEL, LOCALES, type Locale } from "@/lib/i18n/locales";
import type { InstallPlatform } from "@/lib/onboarding/install";
import styles from "./onboarding.module.css";

/**
 * The player first run, four short steps: language, finding your entry, what the app shows, and
 * keeping it on the phone. The copy comes from the player dictionaries, so the whole flow is
 * available in English, Tagalog and Hiligaynon. The preview cards are built from the app's own
 * chips and rows rather than stock art, so what the player sees is what the app really looks like.
 */
export function PlayerTour({
  step,
  locale,
  pendingLocale,
  onChooseLocale,
  onFindEntry,
  platform,
  canInstall,
  installed,
  onInstall,
}: {
  step: number;
  locale: Locale;
  pendingLocale: Locale | null;
  onChooseLocale: (locale: Locale) => void;
  onFindEntry: () => void;
  platform: InstallPlatform;
  canInstall: boolean;
  installed: boolean;
  onInstall: () => void;
}) {
  const { t } = useI18n();

  if (step === 0) {
    const current = pendingLocale ?? locale;
    return (
      <div className={styles.choices} role="group" aria-label={t("onboard.player.language.title")}>
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            className={styles.choice}
            aria-pressed={current === code}
            onClick={() => onChooseLocale(code)}
          >
            {LOCALE_LABEL[code]}
            <span>{code.toUpperCase()}</span>
          </button>
        ))}
      </div>
    );
  }

  if (step === 1) {
    return (
      <>
        <p className={styles.note}>{t("onboard.player.find.ngap")}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={onFindEntry}>
            {t("onboard.player.find.action")}
          </button>
        </div>
      </>
    );
  }

  if (step === 2) {
    return <PreviewCards />;
  }

  const hint = installed
    ? t("onboard.player.install.installed")
    : platform === "ios-safari"
      ? t("onboard.player.install.ios")
      : platform === "android-chrome"
        ? t("onboard.player.install.android")
        : t("onboard.player.install.other");

  return (
    <>
      <div className={styles.installIcon}>
        {platform === "installed" || installed ? (
          <Smartphone size={26} aria-hidden="true" />
        ) : (
          <Download size={26} aria-hidden="true" />
        )}
        <span>{hint}</span>
      </div>
      <div className={styles.actions}>
        {canInstall && !installed && (
          <button type="button" className={styles.primaryBtn} onClick={onInstall}>
            {t("onboard.player.install.install")}
          </button>
        )}
      </div>
    </>
  );
}

function PreviewCards() {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const cards = [
    t("onboard.player.preview.teeTitle"),
    t("onboard.player.preview.boardTitle"),
    t("onboard.player.preview.cardTitle"),
  ];

  const go = (index: number) => {
    const node = track.current;
    if (!node) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollTo({
      left: node.clientWidth * index + 12 * index,
      behavior: reduced ? "auto" : "smooth",
    });
    setActive(index);
  };

  return (
    <>
      <div
        ref={track}
        className={styles.carousel}
        role="group"
        aria-roledescription="carousel"
        aria-label={t("onboard.player.preview.title")}
        tabIndex={0}
        onScroll={(event) => {
          const node = event.currentTarget;
          const width = node.clientWidth + 12;
          const next = Math.round(node.scrollLeft / width);
          if (next !== active) setActive(Math.min(cards.length - 1, Math.max(0, next)));
        }}
      >
        <section className={styles.previewCard} aria-label={cards[0]} aria-roledescription="slide">
          <div className={styles.previewHead}>
            <h3 className={styles.previewTitle}>{cards[0]}</h3>
            <span className={styles.teeDay}>{t("onboard.player.preview.day")}</span>
          </div>
          <div className={styles.teeTime}>6:30 AM</div>
          <div className={styles.chips}>
            <span className={`${styles.chip} ${styles.chipAccent}`}>
              {t("onboard.player.preview.am")}
            </span>
            <span className={styles.chip}>{t("player.course.hole", { hole: 7 })}</span>
            <span className={styles.chip}>{t("onboard.player.preview.group", { number: 3 })}</span>
            <span className={styles.chip}>
              {t("onboard.player.preview.flight", { flight: "A" })}
            </span>
          </div>
          <p className={styles.previewBody}>{t("onboard.player.preview.teeBody")}</p>
        </section>

        <section className={styles.previewCard} aria-label={cards[1]} aria-roledescription="slide">
          <h3 className={styles.previewTitle}>{cards[1]}</h3>
          <div className={styles.boardRows}>
            <div className={styles.boardRow}>
              <span className={styles.boardRank}>1</span>
              <span className={styles.boardName}>R. Santos</span>
              <span className={styles.boardPts}>38</span>
            </div>
            <div className={styles.boardRow} data-you="true">
              <span className={styles.boardRank}>2</span>
              <span className={styles.boardName}>{t("player.board.you")}</span>
              <span className={styles.boardPts}>36</span>
            </div>
            <div className={styles.boardRow}>
              <span className={styles.boardRank}>3</span>
              <span className={styles.boardName}>M. Cruz</span>
              <span className={styles.boardPts}>35</span>
            </div>
          </div>
          <p className={styles.previewBody}>{t("onboard.player.preview.boardBody")}</p>
        </section>

        <section className={styles.previewCard} aria-label={cards[2]} aria-roledescription="slide">
          <h3 className={styles.previewTitle}>{cards[2]}</h3>
          <div className={styles.cardGrid}>
            {[4, 5, 6].map((hole, index) => (
              <div key={hole} className={styles.cardCell}>
                <span>
                  {t("player.scorecard.hole")} {hole} · {t("player.scorecard.par")} 4
                </span>
                <b>{[4, 5, 4][index]}</b>
              </div>
            ))}
          </div>
          <div className={styles.cardTotal}>
            <span>{t("player.scorecard.total")}</span>
            <b>13</b>
          </div>
          <p className={styles.previewBody}>{t("onboard.player.preview.cardBody")}</p>
        </section>
      </div>

      <div className={styles.dots}>
        {cards.map((label, index) => (
          <button
            key={label}
            type="button"
            className={styles.dot}
            aria-label={label}
            aria-current={active === index ? "true" : undefined}
            onClick={() => go(index)}
          >
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className={styles.previewBody}>{t("onboard.player.preview.swipe")}</p>
    </>
  );
}
