"use client";

import type { ReactNode } from "react";
import { HelpButton } from "@/components/help";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { PublicBackLink } from "@/components/public/PublicBackLink";
import { PublicTournamentNav } from "@/components/public/PublicTournamentNav";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n/context";

/** The shared public leaderboard frame, so the sample preview and the live read look the same. */
export function LeaderboardShell({
  eventName,
  dateText,
  children,
}: {
  eventName?: string | null;
  dateText?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <main className="public public-pairings mobile-bar-space">
      <header className="public-head !p-4 sm:!p-5">
        <PublicBackLink label={t("pairings.backHome")} />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={172} />
            <span className="leading-tight">
              <b className="block font-display text-[13px] font-semibold">Leaderboard</b>
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle compact tone="nav" />
            <HelpButton audience="player" screen="pairings" />
          </div>
        </div>
        <h1 className="mt-3 font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          {eventName ?? "Leaderboard"}
        </h1>
        {dateText && <p className="text-on-forest-muted">{dateText}</p>}
      </header>

      <PublicTournamentNav active="leaderboard" />
      {children}
      <PlayerBottomBar />
    </main>
  );
}
