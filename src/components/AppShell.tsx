"use client";

import {
  Bell,
  CircleUserRound,
  ClipboardList,
  Download,
  Flag,
  LayoutGrid,
  Map as MapIcon,
  Menu,
  MonitorPlay,
  Printer,
  Search,
  SlidersHorizontal,
  Smartphone,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { Crest } from "@/components/Crest";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TournamentSelect } from "@/components/TournamentSelect";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { signOut } from "@/lib/auth/actions";
import { validateDraw } from "@/lib/draw/validate";
import { useDesk } from "@/lib/store/desk-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/ui/cn";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  /** Alert dot: only for work waiting on that page. */
  alert?: boolean;
  /** Secondary screens, kept after a divider. */
  group?: "main" | "more";
}

const isCurrent = (path: string, href: string) =>
  href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

/**
 * Application shell from the approved mockup: a top bar (crest and club name, search, current
 * event, alerts, account) and a left rail. On the overview it floats as glass over the course map;
 * on working pages it sits on the club's forest band. Below 1024px the rail becomes a labelled
 * menu sheet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const overlay = path === "/";
  const desk = useDesk();
  const { registrations, draw, warnings, tournament, deferred } = desk;
  const [menuOpen, setMenuOpen] = useState(false);
  // Supabase configured means the sign-in guard is live, but the shell still runs on demo data.
  const supabaseConfigured = isSupabaseConfigured();

  const blocking = useMemo(() => {
    if (!draw || !tournament) return 0;
    return validateDraw({
      draw,
      registrations,
      config: tournament.config,
      engineWarnings: warnings,
      flags: desk.flags,
      names: desk.names,
    }).filter((i) => i.severity === "blocking").length;
  }, [draw, registrations, tournament, warnings, desk.flags, desk.names]);
  const review = registrations.filter((r) => r.status !== "ok").length;
  const registerAttention = registrations.filter(
    (r) => r.status !== "ok" || r.frozenOutdated || r.paymentStatus === "pending",
  ).length;

  const nav: NavItem[] = [
    { href: "/", label: "Overview", icon: LayoutGrid, group: "main" },
    { href: "/tournaments", label: "Tournaments", icon: Trophy, group: "main" },
    { href: "/players", label: "Players", icon: Users, alert: review > 0, group: "main" },
    {
      href: "/register",
      label: "Registration desk",
      icon: ClipboardList,
      alert: registerAttention > 0,
      group: "main",
    },
    {
      href: "/import",
      label: "Handicap imports",
      icon: Download,
      alert: deferred.length > 0,
      group: "main",
    },
    { href: "/draw", label: "Draw & pairings", icon: Flag, alert: blocking > 0, group: "main" },
    { href: "/print", label: "Print center", icon: Printer, group: "main" },
    { href: "/setup", label: "Settings", icon: SlidersHorizontal, group: "main" },
    { href: "/course", label: "Course & holes", icon: MapIcon, group: "more" },
    { href: "/spotlight", label: "Clubhouse display", icon: MonitorPlay, group: "more" },
    { href: "/pairings", label: "Player view", icon: Smartphone, group: "more" },
  ];

  const renderNavLink = (n: NavItem, mobile: boolean) => {
    const on = isCurrent(path, n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={mobile ? () => setMenuOpen(false) : undefined}
        aria-current={on ? "page" : undefined}
        aria-label={mobile ? undefined : n.label}
        className={cn(
          mobile &&
            "flex h-11 items-center gap-3 rounded-md px-3 font-medium text-ink no-underline",
          mobile && (on ? "bg-gold text-on-gold" : "hover:bg-surface-sunken"),
          !mobile && "relative grid size-11 place-items-center rounded-full transition-colors",
          !mobile &&
            (on
              ? "bg-gold text-on-gold"
              : "text-on-forest-muted hover:bg-[rgba(238,240,234,0.1)] hover:text-on-forest"),
        )}
      >
        <n.icon className={cn(mobile ? "size-[18px]" : "size-5")} aria-hidden="true" />
        {mobile ? (
          <>
            <span className="flex-1">{n.label}</span>
            {n.alert && (
              <span className="pill warn" title="Needs attention">
                Check
              </span>
            )}
          </>
        ) : (
          n.alert && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger shadow-[0_0_0_2px_#1a2a21]" />
          )
        )}
      </Link>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("min-h-dvh", overlay && "scheme-dark bg-surface")}>
        <a
          href="#main"
          className="sr focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-gold focus:px-3 focus:py-2 focus:text-on-gold"
        >
          Skip to content
        </a>

        <header
          className={cn(
            "shell-chrome z-30 flex h-[84px] items-center gap-3 px-4 lg:gap-4 lg:px-6",
            overlay ? "absolute inset-x-0 top-0 pt-2" : "band sticky top-0 shadow-card",
          )}
        >
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              className={cn(
                "grid size-11 place-items-center rounded-full lg:hidden",
                overlay ? "glass" : "border border-[rgba(238,240,234,0.25)]",
              )}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" title="Menu" description="Iloilo Golf & Country Club">
              <nav aria-label="Main" className="grid gap-1">
                {nav.filter((n) => n.group !== "more").map((n) => renderNavLink(n, true))}
                <div className="my-2 border-t border-line" role="presentation" />
                {nav.filter((n) => n.group === "more").map((n) => renderNavLink(n, true))}
              </nav>
              <div className="mt-auto grid gap-3">
                <ThemeToggle />
                <p className="hint">By Syntaxure Labs</p>
              </div>
            </SheetContent>
          </Sheet>

          <Link
            href="/"
            className="on-photo flex min-w-0 items-center gap-3 no-underline lg:w-[318px]"
          >
            <Crest size={52} className="shrink-0" />
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate font-display text-[15px] font-extrabold leading-[18px] text-ink">
                Iloilo Golf &amp; Country Club
              </span>
              <span className="block truncate text-xs text-ink-muted">
                Tournament office · Sta. Barbara
              </span>
            </span>
          </Link>

          <ShellSearch overlay={overlay} />

          <TournamentSelect overlay={overlay} />

          <span className="flex-1" />

          <span
            className="hidden h-8 shrink-0 items-center rounded-full bg-gold-soft px-3 text-xs font-semibold whitespace-nowrap text-gold-ink md:inline-flex"
            title="Demo shell with local session data. Players and tee ratings are samples; nothing is saved and there is no server."
          >
            Demo shell · local session data
          </span>

          <Link
            href="/draw"
            aria-label={
              blocking > 0
                ? `${blocking} blocking issue${blocking === 1 ? "" : "s"} in the draw`
                : "No blocking issues"
            }
            className={cn(
              "relative grid size-12 shrink-0 place-items-center rounded-full text-ink",
              overlay ? "glass" : "border border-[rgba(238,240,234,0.18)]",
            )}
          >
            <Bell className="size-5" aria-hidden="true" />
            {blocking > 0 && (
              <i className="absolute top-[11px] right-3 size-2 rounded-full bg-warning shadow-[0_0_0_2px_#1a2a21]" />
            )}
          </Link>

          <span
            className={cn(
              "hidden h-[52px] shrink-0 items-center gap-2.5 rounded-full py-0 pr-2 pl-1.5 md:flex",
              overlay ? "glass" : "border border-[rgba(238,240,234,0.18)]",
            )}
          >
            <span className="grid size-10 place-items-center rounded-full border border-gold bg-forest text-gold">
              <CircleUserRound className="size-5" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <b className="block text-sm whitespace-nowrap text-ink">
                {supabaseConfigured ? "Signed in" : "Demo organizer"}
              </b>
              <small className="text-[11px] whitespace-nowrap text-ink-muted">
                {supabaseConfigured ? "Club member" : "Demo · no sign-in yet"}
              </small>
            </span>
            {supabaseConfigured && (
              <form action={signOut}>
                <button type="submit" className="btn small ghost no-print">
                  Sign out
                </button>
              </form>
            )}
          </span>
        </header>

        <nav
          aria-label="Main"
          className={cn(
            "shell-chrome fixed left-6 z-30 hidden max-h-[calc(100dvh-140px)] w-[60px] flex-col gap-2 overflow-y-auto rounded-[30px] p-2 lg:flex [scrollbar-width:none]",
            overlay ? "glass top-[150px]" : "band top-[108px] shadow-lift",
          )}
        >
          {nav.map((n) => {
            const firstMore = n.group === "more" && n.href === "/course";
            return (
              <div key={n.href} className="contents">
                {firstMore && (
                  <div
                    className="mx-1 my-1 border-t border-[rgba(238,240,234,0.14)]"
                    role="presentation"
                  />
                )}
                {renderNavLink(n, false)}
              </div>
            );
          })}
          <div className="mt-1 border-t border-[rgba(238,240,234,0.14)] pt-2">
            <ThemeToggle compact />
          </div>
        </nav>

        <main id="main" className={cn(!overlay && "px-4 pt-6 pb-16 sm:px-6 lg:pr-8 lg:pl-[112px]")}>
          {supabaseConfigured && !overlay && (
            <div
              className="no-print mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-warning bg-warning-soft px-3.5 py-2 text-[13px]"
              role="note"
            >
              <b>Supabase is configured, but this shell is not connected to it yet.</b>
              <span className="text-ink-muted">
                Screens still run on local session demo data. The data layer is parked at
                src/lib/data/supabase for the wiring task.
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}

/** Finds a player by name and opens the players list filtered to them. */
function ShellSearch({ overlay }: { overlay: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={cn(
        "hidden h-12 w-[min(360px,30vw)] items-center gap-2.5 rounded-full px-[18px] md:flex",
        overlay ? "glass" : "border border-[rgba(238,240,234,0.18)] bg-[rgba(0,0,0,0.14)]",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/players?q=${encodeURIComponent(q.trim())}` : "/players");
      }}
    >
      <Search className="size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
      <label htmlFor="shell-search" className="sr">
        Search players
      </label>
      <input
        id="shell-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search players…"
        className="!h-auto !border-0 !bg-transparent !p-0 text-sm !text-ink outline-none"
      />
    </form>
  );
}
