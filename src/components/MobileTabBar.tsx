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
import { useState } from "react";
import { cn } from "@/lib/ui/cn";
import {
  DESK_MOBILE_ITEMS,
  isMobileCurrent,
  type MobileIcon,
  type MobileNavItem,
  PLAYER_MOBILE_ITEMS,
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
  moreOpen,
}: {
  items: readonly MobileNavItem[];
  label: string;
  testId: string;
  onMore?: () => void;
  moreOpen?: boolean;
}) {
  const path = usePathname();

  return (
    <nav aria-label={label} className="mobile-tabbar" data-testid={testId}>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        if (item.kind === "more") {
          return (
            <button
              key={item.testId}
              type="button"
              className="mobile-tabbar-item"
              onClick={onMore}
              aria-expanded={moreOpen}
              aria-controls={moreOpen === undefined ? undefined : "player-more-destinations"}
              data-testid={item.testId}
            >
              <span className="mobile-tabbar-icon">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>{item.label}</span>
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
          >
            <span className={cn("mobile-tabbar-icon", item.action && "mobile-tabbar-action")}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span>{item.label}</span>
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

export function PlayerBottomBar({
  labels,
}: {
  labels?: {
    navigation: string;
    home: string;
    board: string;
    card: string;
    more: string;
    course: string;
    pairings: string;
    profile: string;
  };
}) {
  const copy = labels ?? {
    navigation: "Player",
    home: "Home",
    board: "Board",
    card: "Card",
    more: "More",
    course: "Course map",
    pairings: "Pairings",
    profile: "Profile",
  };
  const [open, setOpen] = useState(false);
  const destinations = [
    { href: "/my/course", label: copy.course, Icon: Map },
    { href: "/pairings", label: copy.pairings, Icon: List },
    { href: "/my/profile", label: copy.profile, Icon: CircleUserRound },
  ];
  const itemLabels: Record<string, string> = {
    "player-bar-home": copy.home,
    "player-bar-board": copy.board,
    "player-bar-card": copy.card,
    "player-bar-more": copy.more,
  };
  const items = PLAYER_MOBILE_ITEMS.map((item) => ({
    ...item,
    label: itemLabels[item.testId] ?? item.label,
  }));

  return (
    <>
      <TabBar
        items={items}
        label={copy.navigation}
        testId="player-bottom-bar"
        onMore={() => setOpen((wasOpen) => !wasOpen)}
        moreOpen={open}
      />
      {open && (
        <nav
          id="player-more-destinations"
          aria-label="More player destinations"
          className="player-more-menu"
        >
          {destinations.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="player-more-menu-item no-underline"
              onClick={() => setOpen(false)}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

/** Persistent player navigation for desktop, where the phone bottom bar is hidden. */
export function PlayerDesktopNav({
  labels,
}: {
  labels: {
    navigation: string;
    home: string;
    board: string;
    card: string;
    course: string;
    pairings: string;
    profile: string;
  };
}) {
  const path = usePathname();
  const items = [
    { href: "/my", label: labels.home, exact: true },
    { href: "/my/board", label: labels.board },
    { href: "/my/card", label: labels.card },
    { href: "/my/course", label: labels.course },
    { href: "/pairings", label: labels.pairings },
    { href: "/my/profile", label: labels.profile },
  ];

  return (
    <nav aria-label={labels.navigation} className="player-desktop-nav">
      {items.map(({ href, label, exact }) => {
        const current = isMobileCurrent(path, href) && (!exact || path === href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn("player-desktop-nav-item no-underline", current && "is-current")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
