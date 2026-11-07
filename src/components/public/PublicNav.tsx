import Link from "next/link";
import type { Translate } from "@/lib/i18n/t";

/**
 * The way out of a shared player page.
 *
 * A pairings link arrives in a group chat, so the page has to lead somewhere: the club home, the
 * pairings, the leaderboard and the player's own area. The page a player is already on says so with
 * aria-current instead of being a second link to nowhere.
 */
export function PublicNav({ current, t }: { current: string; t: Translate }) {
  const items = [
    { href: "/", label: t("pairings.navHome") },
    { href: "/pairings", label: t("player.app.openPairings") },
    { href: "/leaderboard", label: t("player.board.title") },
    { href: "/my", label: t("player.title") },
  ];

  return (
    <nav aria-label={t("pairings.nav")} className="public-nav no-print">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={current === item.href ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
