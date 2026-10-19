"use client";

import Link from "next/link";
import { HelpButton } from "@/components/help";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PairingsView } from "@/components/PairingsView";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { fmtDateLabel } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import { fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { useDesk } from "@/lib/store/desk-store";

/**
 * The demo build of the player page (no Supabase URL). It reads the frozen published copy in the
 * browser session through the public allow-list projection. With Supabase configured, page.tsx
 * serves the published version from the database instead.
 */
export function DemoPairings() {
  const { t } = useI18n();
  const { published, tournament } = useDesk();

  if (!tournament) return <NeedsTournament what="The player view" />;

  const pairings = published
    ? toPublicPairings({
        published,
        tournamentName: tournament.name,
        dateLabel: fmtDateLabel(tournament.dates),
        startFormat: tournament.config.startFormat,
        firstTeeTime: tournament.config.firstTeeTime,
      })
    : null;

  return (
    <div className="public mobile-bar-space">
      <header className="public-head">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={172} />
            <span className="leading-tight">
              <b className="block font-display text-[13px] font-semibold">{t("pairings.title")}</b>
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <HelpButton audience="player" screen="pairings" />
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
        <p className="text-on-forest-muted">{fmtDateLabel(tournament.dates)}</p>
      </header>

      {!pairings ? (
        <div className="notice" role="status">
          <b>{t("pairings.notOutTitle")}</b> {t("pairings.notOutBody")}
        </div>
      ) : (
        <PairingsView pairings={pairings} headingLevel="section" />
      )}

      <p className="hint no-print">
        {t("pairings.demoFooter")} <Link href="/">{t("pairings.home")}</Link>
      </p>
      <PlayerBottomBar />
    </div>
  );
}
