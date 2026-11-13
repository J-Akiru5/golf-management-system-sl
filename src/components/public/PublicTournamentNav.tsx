"use client";

import { Flag, ListOrdered, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { type PublicTab, publicTabHref } from "@/lib/data/public-tabs";
import { useI18n } from "@/lib/i18n/context";

const TAB =
  "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap no-underline";

/**
 * The three public tournament tabs. They are links, not in-page anchors, so the URL always names
 * the tab and a shared link opens the same view. The active tab is filled in, the rest stay outlined.
 * A player's profile is reached from a Players card, so it keeps Players active rather than adding a
 * fourth tab (issue 207 follow-up).
 */
export function PublicTournamentNav({ active }: { active: PublicTab }) {
  const { t } = useI18n();
  const tabs: Array<{ tab: PublicTab; label: string; Icon: typeof Flag }> = [
    { tab: "pairings", label: t("programme.navPairings"), Icon: Flag },
    { tab: "players", label: t("programme.navPlayers"), Icon: Users },
    { tab: "leaderboard", label: t("programme.navLeaderboard"), Icon: Trophy },
    { tab: "scores", label: t("programme.navScores"), Icon: ListOrdered },
  ];
  const shownActive = active === "profile" ? "players" : active;

  return (
    <nav
      className="public-tabs no-print flex w-full min-w-0 flex-wrap gap-2 pb-1"
      aria-label={t("programme.navLabel")}
    >
      {tabs.map(({ tab, label, Icon }) => {
        const current = tab === shownActive;
        return (
          <Link
            key={tab}
            href={publicTabHref(tab)}
            aria-current={current ? "page" : undefined}
            className={`public-tab ${TAB} ${
              current
                ? "border-forest bg-forest text-on-forest"
                : "border-line bg-surface-raised text-ink hover:bg-fairway-soft"
            }`}
          >
            <Icon className="public-tab-icon" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
