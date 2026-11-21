"use client";

import {
  CheckSquare,
  FileText,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  SquareKanban,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { AccessMap } from "@/lib/access/pages";
import { cn } from "@/lib/ui/cn";
import { BrandMark } from "./brand-mark";
import { isActive, type NavIcon, type NavItem, navItemsFor, pageTitle } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { type ShellViewer, UserCard, UserMenu } from "./user-menu";

export type { ShellViewer };

const ICONS: Record<NavIcon, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  docs: FileText,
  board: SquareKanban,
  tasks: CheckSquare,
  settings: Settings,
  admin: ShieldCheck,
};

function NavList({
  items,
  pathname,
  onNavigate,
  className,
}: {
  items: ReadonlyArray<NavItem>;
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-1", className)}>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors",
              active
                ? "bg-surface-sunken text-ink"
                : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
            )}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold"
              />
            ) : null}
            <Icon className="size-4 flex-none" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNav({ pathname, items }: { pathname: string; items: ReadonlyArray<NavItem> }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold",
              active ? "text-ink" : "text-ink-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("h-0.5 w-6 rounded-full", active ? "bg-gold" : "bg-transparent")}
            />
            <Icon className="size-5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The chrome around every signed-in page: a sidebar from 1024px, a top bar, and on a phone a bottom
 * bar with a menu that carries the rest. Navigation state comes from the path, so no page has to
 * pass anything down.
 */
export function AppShell({
  viewer,
  access,
  signOut,
  children,
}: {
  viewer: ShellViewer;
  /** The pages this person may see. The menu and the bottom bar are built from it. */
  access: AccessMap;
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = pageTitle(pathname);
  const items = navItemsFor(access);

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-line-strong focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>

      <aside className="hidden border-r border-line bg-surface-raised lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-[248px] lg:flex-col">
        <div className="flex h-16 items-center border-b border-line px-4">
          <Link href="/" aria-label="TeeLine Workspace home">
            <BrandMark />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList items={items} pathname={pathname} />
        </div>
        <div className="border-t border-line p-3">
          <ThemeToggle className="w-full justify-between" />
          <p className="mt-2 px-1 text-[11px] text-ink-muted">TeeLine Workspace</p>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" title="Menu">
              <Link href="/" aria-label="TeeLine Workspace home" onClick={() => setMenuOpen(false)}>
                <BrandMark />
              </Link>
              <NavList items={items} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
              <div className="mt-auto flex flex-col gap-3 pt-3">
                <ThemeToggle className="w-full justify-between" />
                <UserCard viewer={viewer} signOut={signOut} />
              </div>
            </SheetContent>
          </Sheet>

          <p className="truncate font-display text-base font-bold text-ink">{title}</p>

          <div className="ml-auto">
            <UserMenu viewer={viewer} signOut={signOut} />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1200px] px-3 pb-28 pt-6 sm:px-4 lg:pb-12">
          {children}
        </main>
      </div>

      <BottomNav pathname={pathname} items={items} />
    </div>
  );
}
