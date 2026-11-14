"use client";

import type { ReactNode } from "react";
import { HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PublicBottomBar } from "@/components/MobileTabBar";
import { PublicAdvisoryBanner } from "@/components/public/PublicAdvisoryBanner";
import { PublicBackLink } from "@/components/public/PublicBackLink";
import { PublicTournamentNav } from "@/components/public/PublicTournamentNav";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { PublicTab } from "@/lib/data/public-tabs";
import { useI18n } from "@/lib/i18n/context";
import type { PublicAdvisory } from "@/lib/public/advisory";

/**
 * The shared public results frame, so the leaderboard, All scores, the sample preview and the live
 * read look the same. `active` names the tab to fill in.
 */
export function LeaderboardShell({
  eventName,
  dateText,
  advisory = null,
  active = "leaderboard",
  children,
}: {
  eventName?: string | null;
  dateText?: string;
  advisory?: PublicAdvisory | null;
  active?: PublicTab;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <main className="public public-pairings mobile-bar-space">
      <header className="public-head public-appbar p-4 sm:p-5">
        <PublicBackLink label={t("pairings.backHome")} />
        <div className="public-appbar-controls flex items-center gap-2">
          <ThemeToggle compact tone="nav" />
          <LanguageSwitcher tone="on-forest" />
          <HelpButton audience="player" screen="pairings" />
        </div>
        <div className="appbar-foot">
          <div className="public-appbar-brand flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={172} />
            <span className="leading-tight">
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <div className="appbar-title">
            <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
              {eventName ?? "Leaderboard"}
            </h1>
            {dateText && <p className="text-on-forest-muted">{dateText}</p>}
          </div>
        </div>
      </header>

      {advisory && <PublicAdvisoryBanner advisory={advisory} />}

      <PublicTournamentNav active={active} />
      {children}
      <PublicBottomBar />
    </main>
  );
}
