"use client";

import Link from "next/link";
import { HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PairingsView } from "@/components/PairingsView";
import {
  PlayerDirectory,
  ProgrammeNav,
  RulesOfPlay,
  TeeTimesBoard,
} from "@/components/public/ProgrammeView";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { fmtDateLabel, fmtRange } from "@/lib/data/labels";
import { toPublicPairings, toPublicProgramme } from "@/lib/data/public";
import { fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { demoPairings, demoProgramme } from "@/lib/player/demo";
import { useDesk } from "@/lib/store/desk-store";

/**
 * The demo build of the player page (no Supabase URL). It reads the frozen published copy in the
 * browser session through the public allow-list projection. With Supabase configured, page.tsx
 * serves the published version from the database instead.
 *
 * The free-text rules live on the tournament, so they show the moment the demo event has some.
 */
export function DemoPairings() {
  const { t } = useI18n();
  const { published, tournament, days, entries, registrations, players } = useDesk();

  if (!tournament) return <NeedsTournament what="The player view" />;

  const programme =
    (published
      ? toPublicProgramme({
          days,
          entries,
          registrations,
          players,
          categories: tournament.categories,
          flights: tournament.flights,
          rulesOfPlay: tournament.rulesOfPlay,
        })
      : null) ?? demoProgramme();
  const dates = programme.days.length
    ? programme.days.map((day) => day.playDate)
    : tournament.dates;
  const dateLabel = dates.length > 1 ? fmtRange(dates) : fmtDateLabel(dates);
  const pairings =
    (published
      ? toPublicPairings({
          published,
          tournamentName: tournament.name,
          dateLabel,
          startFormat: tournament.config.startFormat,
          firstTeeTime: tournament.config.firstTeeTime,
        })
      : null) ?? demoPairings();

  return (
    <main className="public public-pairings mobile-bar-space">
      <header className="public-head">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={172} />
            <span className="leading-tight">
              <b className="block font-display text-[13px] font-semibold">{t("pairings.title")}</b>
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher tone="on-forest" />
            <HelpButton audience="player" screen="pairings" />
          </div>
        </div>
        <p className="overline mt-3 !text-gold">
          {tournament.config.startFormat === "shotgun"
            ? t("pairings.shotgun")
            : t("pairings.twoTee")}{" "}
          · {fmtTime(tournament.config.firstTeeTime)}
        </p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          {tournament.name}
        </h1>
        <p className="text-on-forest-muted">{dateLabel}</p>
      </header>

      {!pairings ? (
        <section className="pairings-empty" role="status">
          <h2>{t("pairings.notOutTitle")}</h2>
          <p>{t("pairings.notOutBody")}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link className="btn ghost no-print" href="/pairings#tee-times">
              {t("programme.navTeeTimes")}
            </Link>
            <Link className="btn ghost no-print" href="/">
              {t("pairings.home")}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {programme && (
            <>
              <ProgrammeNav programme={programme} hasPairings />
              <TeeTimesBoard programme={programme} />
              <PlayerDirectory programme={programme} />
            </>
          )}

          <section
            className="grid gap-3"
            id="pairings"
            style={{ scrollMarginTop: "calc(7rem + env(safe-area-inset-top, 0px))" }}
          >
            <h2 className="text-[20px] leading-7">{t("programme.navPairings")}</h2>
            <PairingsView pairings={pairings} headingLevel="section" flightFilter />
          </section>

          {programme?.rulesOfPlay && <RulesOfPlay text={programme.rulesOfPlay} />}
        </>
      )}

      <p className="hint no-print">
        {t("pairings.demoFooter")} <Link href="/">{t("pairings.home")}</Link>
      </p>
      <PlayerBottomBar />
    </main>
  );
}
