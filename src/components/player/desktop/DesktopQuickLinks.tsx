import { ClipboardList, List, Map, Trophy } from "lucide-react";
import { DesktopLinkCard } from "@/components/player/desktop/DesktopLinkCard";
import type { Translate } from "@/lib/i18n/t";

/**
 * The four places a player actually goes, as a list rather than tiles.
 *
 * The same wording as `AppTiles`, which is what the narrow screens show, so switching widths never
 * changes what a row means.
 */
export function DesktopQuickLinks({ t }: { t: Translate }) {
  const links = [
    {
      href: "/my/board",
      label: t("player.app.openBoard"),
      hint: t("home.desktop.boardHint"),
      Icon: Trophy,
    },
    {
      href: "/my/card",
      label: t("player.app.openCard"),
      hint: t("home.desktop.cardHint"),
      Icon: ClipboardList,
    },
    {
      href: "/my/course",
      label: t("player.app.openCourse"),
      hint: t("home.desktop.courseHint"),
      Icon: Map,
    },
    {
      href: "/pairings",
      label: t("player.app.openPairings"),
      hint: t("home.desktop.pairingsHint"),
      Icon: List,
    },
  ];

  return (
    <ul className="plain ph-quick-list">
      {links.map(({ href, label, hint, Icon }) => (
        <DesktopLinkCard key={href} href={href} label={label} hint={hint} Icon={Icon} />
      ))}
    </ul>
  );
}
