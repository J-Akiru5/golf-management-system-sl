"use client";

import {
  CircleUserRound,
  ClipboardList,
  Flag,
  House,
  LayoutGrid,
  List,
  Map,
  Menu,
  TableProperties,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/t";
import { cn } from "@/lib/ui/cn";
import {
  DESK_MOBILE_ITEMS,
  isMobileCurrent,
  type MobileIcon,
  type MobileNavItem,
  PLAYER_MOBILE_ITEMS,
  PUBLIC_MOBILE_ITEMS,
} from "@/lib/ui/mobile-nav";

const ICONS: Record<MobileIcon, typeof Flag> = {
  grid: LayoutGrid,
  flag: Flag,
  clipboard: ClipboardList,
  users: Users,
  printer: TableProperties,
  menu: Menu,
  player: CircleUserRound,
  list: List,
  home: House,
  trophy: Trophy,
};

/**
 * One bar, two audiences. The desk bar's last item opens the existing drawer instead of being a
 * link: the drawer stays on phones because the bar can hold four destinations, and the desk has
 * eleven. Replacing the drawer would hide Settings, Import, Course, Tournaments and Spotlight
 * behind nothing.
 */
function TabBar({
  items,
  label,
  testId,
  onMore,
}: {
  items: readonly MobileNavItem[];
  label: string;
  testId: string;
  onMore?: () => void;
}) {
  const path = usePathname();
  const { t } = useI18n();
  const labelOf = (item: MobileNavItem): string =>
    item.labelKey ? t(item.labelKey as TranslationKey) : item.label;

  return (
    <nav
      aria-label={label}
      className="mobile-tabbar"
      data-testid={testId}
      data-onboard={testId === "player-bottom-bar" ? "tab-bar" : undefined}
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const onboard = item.testId.startsWith("player-bar-")
          ? `tab-${item.testId.slice("player-bar-".length)}`
          : undefined;
        if (item.kind === "more") {
          return (
            <button
              key={item.testId}
              type="button"
              className="mobile-tabbar-item"
              onClick={onMore}
              data-testid={item.testId}
              data-onboard={onboard}
            >
              <span className="mobile-tabbar-icon">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>{labelOf(item)}</span>
            </button>
          );
        }
        const on = isMobileCurrent(path, item.href) && (!item.exact || path === item.href);
        return (
          <Link
            key={item.testId}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "mobile-tabbar-item no-underline",
              item.action && "is-action",
              on && "is-current",
            )}
            data-testid={item.testId}
            data-onboard={onboard}
          >
            <span className={cn("mobile-tabbar-icon", item.action && "mobile-tabbar-action")}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span>{labelOf(item)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DeskBottomBar({ onMore }: { onMore: () => void }) {
  return (
    <TabBar
      items={DESK_MOBILE_ITEMS}
      label="Desk quick actions"
      testId="desk-bottom-bar"
      onMore={onMore}
    />
  );
}

export function PlayerBottomBar() {
  return <TabBar items={PLAYER_MOBILE_ITEMS} label="Player" testId="player-bottom-bar" />;
}

/** The same bar for readers who are not signed in: four open destinations, club home first. */
export function PublicBottomBar() {
  return <TabBar items={PUBLIC_MOBILE_ITEMS} label="Club pages" testId="public-bottom-bar" />;
}

export interface PlayerNavLabels {
  navigation: string;
  home: string;
  pairings: string;
  board: string;
  card: string;
  course: string;
  profile: string;
}

/**
 * The same destinations on a wide screen, where the phone bar is hidden from 1024px.
 *
 * The phone bar carries four because four labels fit a 360px screen. A monitor has room for the
 * two the bar leaves out (the published card and the course map), so nothing a player uses is
 * reachable only by first going back to My golf.
 */
export function PlayerDesktopNav({ labels }: { labels: PlayerNavLabels }) {
  const path = usePathname();
  const items = [
    { href: "/my", label: labels.home, Icon: House, exact: true },
    { href: "/pairings", label: labels.pairings, Icon: List },
    { href: "/my/board", label: labels.board, Icon: Trophy },
    { href: "/my/card", label: labels.card, Icon: ClipboardList },
    { href: "/my/course", label: labels.course, Icon: Map },
    { href: "/my/profile", label: labels.profile, Icon: CircleUserRound },
  ];

  return (
    <nav aria-label={labels.navigation} className="player-desktop-nav">
      {items.map(({ href, label, Icon, exact }) => {
        const on = isMobileCurrent(path, href) && (!exact || path === href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className="player-desktop-nav-item"
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
