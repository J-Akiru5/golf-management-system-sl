"use client";

import Link from "next/link";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PairingsView } from "@/components/PairingsView";
import {
  PlayerDirectory,
  ProgrammeNav,
  RulesOfPlay,
  TeeTimesBoard,
} from "@/components/public/ProgrammeView";
import { PublicHeader } from "@/components/public/PublicHeader";
import { fmtDateLabel, fmtRange } from "@/lib/data/labels";
import { toPublicPairings, toPublicProgramme } from "@/lib/data/public";
import { fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
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

  const programme = published
    ? toPublicProgramme({
        days,
        entries,
        registrations,
        players,
        categories: tournament.categories,
        flights: tournament.flights,
        rulesOfPlay: tournament.rulesOfPlay,
      })
    : null;
  const dates = programme?.days.length
    ? programme.days.map((day) => day.playDate)
    : tournament.dates;
  const dateLabel = dates.length > 1 ? fmtRange(dates) : fmtDateLabel(dates);
  const pairings = published
    ? toPublicPairings({
        published,
        tournamentName: tournament.name,
        dateLabel,
        startFormat: tournament.config.startFormat,
        firstTeeTime: tournament.config.firstTeeTime,
      })
    : null;

  return (
    <main className="public public-pairings mobile-bar-space">
      <PublicHeader current="/pairings" label={t("pairings.title")} t={t} help="pairings">
        <p className="overline mt-3">
          {tournament.config.startFormat === "shotgun"
            ? t("pairings.shotgun")
            : t("pairings.twoTee")}{" "}
          · {fmtTime(tournament.config.firstTeeTime)}
        </p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          {tournament.name}
        </h1>
        <p className="text-on-forest-muted">{dateLabel}</p>
      </PublicHeader>

      {!pairings ? (
        <div className="notice" role="status">
          <b>{t("pairings.notOutTitle")}</b> {t("pairings.notOutBody")}
        </div>
      ) : (
        <>
          {programme && (
            <>
              <ProgrammeNav programme={programme} hasPairings />
              <TeeTimesBoard programme={programme} />
              <PlayerDirectory programme={programme} />
            </>
          )}

          <section className="grid gap-3" id="pairings">
            <h2 className="text-[20px] leading-7">{t("programme.navPairings")}</h2>
            <PairingsView pairings={pairings} headingLevel="section" />
          </section>

          {programme?.rulesOfPlay && <RulesOfPlay text={programme.rulesOfPlay} />}
        </>
      )}

      <p className="hint no-print">{t("pairings.demoFooter")}</p>
      <p className="hint no-print">
        <Link href="/" className="font-semibold underline underline-offset-2">
          {t("pairings.home")}
        </Link>
      </p>
      <PlayerBottomBar />
    </main>
  );
}
