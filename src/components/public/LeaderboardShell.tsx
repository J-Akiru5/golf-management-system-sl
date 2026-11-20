"use client";

import type { ReactNode } from "react";
import { HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PublicBottomBar } from "@/components/MobileTabBar";
import { PublicAdvisoryBanner } from "@/components/public/PublicAdvisoryBanner";
import { PublicTournamentNav } from "@/components/public/PublicTournamentNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { PublicTab } from "@/lib/data/public-tabs";
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
  return (
    <main className="public public-pairings mobile-bar-space">
      <header className="public-head tl-pub-page-head tl-pairings-head">
        <div className="public-appbar-controls flex items-center gap-2">
          <ThemeToggle compact tone="nav" />
          <LanguageSwitcher tone="on-forest" />
          <HelpButton audience="player" screen="pairings" />
        </div>
        <p className="tl-pub-kicker">TeeLine Golf · Published results</p>
        <h1 className="tl-pub-title">{eventName ?? "Leaderboard"}</h1>
        {dateText && <p className="tl-pub-intro">{dateText}</p>}
      </header>

      {advisory && <PublicAdvisoryBanner advisory={advisory} />}

      <PublicTournamentNav active={active} />
      {children}
      <PublicBottomBar />
    </main>
  );
}
