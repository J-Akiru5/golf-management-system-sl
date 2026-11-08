"use client";

import Link from "next/link";
import { type PublicTab, publicTabHref } from "@/lib/data/public-tabs";
import { useI18n } from "@/lib/i18n/context";

const TAB =
  "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap no-underline";

/**
 * The four public tournament tabs. They are links, not in-page anchors, so the URL always names the
 * tab and a shared link opens the same view. The active tab is filled in, the rest stay outlined.
 */
export function PublicTournamentNav({ active }: { active: PublicTab }) {
  const { t } = useI18n();
  const tabs: Array<{ tab: PublicTab; label: string }> = [
    { tab: "pairings", label: t("programme.navPairings") },
    { tab: "players", label: t("programme.navPlayers") },
    { tab: "profile", label: t("programme.navProfile") },
    { tab: "leaderboard", label: t("programme.navLeaderboard") },
  ];

  return (
    <nav
      className="no-print flex w-full min-w-0 gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
      aria-label={t("programme.navLabel")}
    >
      {tabs.map(({ tab, label }) => {
        const current = tab === active;
        return (
          <Link
            key={tab}
            href={publicTabHref(tab)}
            aria-current={current ? "page" : undefined}
            className={`${TAB} ${
              current
                ? "border-forest bg-forest text-on-forest"
                : "border-line bg-surface-raised text-ink hover:bg-fairway-soft"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
