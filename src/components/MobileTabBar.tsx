"use client";

import {
  CircleUserRound,
  ClipboardList,
  Flag,
  House,
  LayoutGrid,
  List,
  Menu,
  TableProperties,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
              data-testid={item.testId}
            >
              <span className="mobile-tabbar-icon">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>{item.label}</span>
            </button>
          );
        }
        const on = isMobileCurrent(path, item.href);
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

export function PlayerBottomBar() {
  return <TabBar items={PLAYER_MOBILE_ITEMS} label="Player" testId="player-bottom-bar" />;
}
