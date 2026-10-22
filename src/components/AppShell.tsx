"use client";

import {
  Bell,
  CalendarClock,
  CircleUserRound,
  ClipboardCheck,
  ClipboardList,
  Contact,
  Download,
  Flag,
  LayoutGrid,
  Map as MapIcon,
  Menu,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  ScrollText,
  Search,
  SlidersHorizontal,
  Smartphone,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { roleLabel } from "@/components/desk";
import { FirstRunWelcome, HelpButton } from "@/components/help";
import { DeskBottomBar } from "@/components/MobileTabBar";
import { AlertsBell } from "@/components/notifications/AlertsBell";
import { SignOutForm } from "@/components/SignOutForm";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TournamentSelect } from "@/components/TournamentSelect";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tip, TooltipProvider } from "@/components/ui/tooltip";
import { validateDraw } from "@/lib/draw/validate";
import { useDesk } from "@/lib/store/desk-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/ui/cn";
import { applyRail, parseRail, RAIL_KEY, type RailChoice } from "@/lib/ui/rail";

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
  const overlay = path === "/admin";
  const desk = useDesk();
  const { registrations, draw, warnings, tournament, deferred, member, status } = desk;
  const [menuOpen, setMenuOpen] = useState(false);
  // Compact by default; the saved choice is applied by the pre-paint script, read back here so the
  // buttons agree with what the page already shows.
  const [rail, setRail] = useState<RailChoice>("compact");
  const railExpanded = rail === "expanded";
  useEffect(() => {
    try {
      setRail(parseRail(window.localStorage.getItem(RAIL_KEY)));
    } catch {
      // Storage off: stay compact.
    }
  }, []);
  const toggleRail = () => {
    const next: RailChoice = railExpanded ? "compact" : "expanded";
    setRail(next);
    applyRail(next);
  };
  // Supabase configured means the sign-in guard is live, but the shell still runs on demo data.
  const supabaseConfigured = isSupabaseConfigured();
  // The account chip says what the desk store knows, not just that a server exists.
  const account = !supabaseConfigured
    ? { name: "Demo organizer", detail: "Demo · no sign-in yet" }
    : member
      ? { name: member.displayName, detail: roleLabel(member.role) ?? "Club member" }
      : status === "loading"
        ? { name: "Signing in…", detail: "Loading the desk" }
        : { name: "Not signed in", detail: "Session unavailable" };

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
    { href: "/admin", label: "Control room", icon: LayoutGrid, group: "main" },
    { href: "/tournaments", label: "Tournaments", icon: Trophy, group: "main" },
    { href: "/players", label: "Players", icon: Users, alert: review > 0, group: "main" },
    { href: "/caddies", label: "Caddies", icon: Contact, group: "main" },
    {
      href: "/register",
      label: "Registration desk",
      icon: ClipboardList,
      alert: registerAttention > 0,
      group: "main",
    },
    { href: "/tee-times", label: "Tee times", icon: CalendarClock, group: "main" },
    {
      href: "/import",
      label: "Handicap imports",
      icon: Download,
      alert: deferred.length > 0,
      group: "main",
    },
    { href: "/draw", label: "Draw & pairings", icon: Flag, alert: blocking > 0, group: "main" },
    { href: "/scores", label: "Scores", icon: ClipboardCheck, group: "main" },
    { href: "/print", label: "Print center", icon: Printer, group: "main" },
    { href: "/setup", label: "Settings", icon: SlidersHorizontal, group: "main" },
    { href: "/course", label: "Course & holes", icon: MapIcon, group: "more" },
    { href: "/spotlight", label: "Clubhouse display", icon: MonitorPlay, group: "more" },
    { href: "/audit", label: "Audit log", icon: ScrollText, group: "more" },
    { href: "/pairings", label: "Player view", icon: Smartphone, group: "more" },
  ];

  const renderNavLink = (n: NavItem, mobile: boolean) => {
    const on = isCurrent(path, n.href);
    const link = (
      <Link
        key={n.href}
        href={n.href}
        onClick={mobile ? () => setMenuOpen(false) : undefined}
        aria-current={on ? "page" : undefined}
        aria-label={mobile || railExpanded ? undefined : n.label}
        className={cn(
          mobile &&
            "flex h-11 items-center gap-3 rounded-md px-3 font-medium text-ink no-underline",
          mobile && (on ? "bg-gold text-on-gold" : "hover:bg-surface-sunken"),
          !mobile && "relative flex items-center rounded-full transition-colors",
          !mobile && (railExpanded ? "h-11 gap-3 px-3" : "size-11 justify-center"),
          !mobile &&
            (on
              ? "bg-gold text-on-gold"
              : "text-on-forest-muted hover:bg-[rgba(238,240,234,0.1)] hover:text-on-forest"),
        )}
      >
        <n.icon className={cn("shrink-0", mobile ? "size-[18px]" : "size-5")} aria-hidden="true" />
        {mobile ? (
          <>
            <span className="flex-1">{n.label}</span>
            {n.alert && (
              <span className="pill warn" title="Needs attention">
                Check
              </span>
            )}
          </>
        ) : railExpanded ? (
          <>
            <span className="flex-1 truncate text-[13px] font-medium">{n.label}</span>
            {n.alert && (
              <span className="size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
            )}
          </>
        ) : (
          n.alert && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger shadow-[0_0_0_2px_#1a2a21]" />
          )
        )}
      </Link>
    );
    // Compact has no room for the word, so the tooltip carries it (and says why there is a dot).
    return mobile || railExpanded ? (
      link
    ) : (
      <Tip label={n.alert ? `${n.label} · needs attention` : n.label}>{link}</Tip>
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
            <SheetContent side="left" title="Menu" description="TeeLine Golf tournament office">
              <nav aria-label="Main" className="grid gap-1">
                {nav.filter((n) => n.group !== "more").map((n) => renderNavLink(n, true))}
                <div className="my-2 border-t border-line" role="presentation" />
                {nav.filter((n) => n.group === "more").map((n) => renderNavLink(n, true))}
              </nav>
              <div className="mt-auto grid gap-3">
                <ThemeToggle />
                <p className="hint">Developed by Syntaxure Labs</p>
              </div>
            </SheetContent>
          </Sheet>

          <Link
            href="/admin"
            className="on-photo flex min-w-0 items-center gap-3 no-underline lg:w-[318px]"
          >
            <TeeLineLogo variant="reverse" width={206} className="shrink-0" />
          </Link>

          <ShellSearch overlay={overlay} />

          <TournamentSelect overlay={overlay} />

          <span className="flex-1" />

          {status === "demo" && (
            <span
              className="hidden h-8 shrink-0 items-center rounded-full bg-gold-soft px-3 text-xs font-semibold whitespace-nowrap text-gold-ink xl:inline-flex"
              title="Demo shell with local session data. Players and tee ratings are samples; nothing is saved and there is no server."
            >
              Demo shell · local session data
            </span>
          )}

          <AlertsBell overlay={overlay} />

          <HelpButton audience="desk" screen={path} overlay={overlay} />

          <span
            className={cn(
              "hidden h-[52px] shrink-0 items-center gap-2.5 rounded-full py-0 pr-2 pl-1.5 md:flex",
              overlay ? "glass" : "border border-[rgba(238,240,234,0.18)]",
            )}
          >
            <span className="grid size-10 place-items-center rounded-full border border-gold bg-forest text-gold">
              <CircleUserRound className="size-5" aria-hidden="true" />
            </span>
            <span className="max-w-[170px] leading-tight">
              <b className="block truncate text-sm text-ink">{account.name}</b>
              <small className="block truncate text-[11px] text-ink-muted">{account.detail}</small>
            </span>
            {supabaseConfigured &&
              (member ? (
                <SignOutForm className="chrome-btn no-print" />
              ) : (
                status === "error" && (
                  <Link href="/login" className="chrome-btn no-print no-underline">
                    Sign in
                  </Link>
                )
              ))}
          </span>
        </header>

        <nav
          aria-label="Main"
          className={cn(
            "shell-chrome fixed left-6 z-30 hidden max-h-[calc(100dvh-140px)] w-[var(--rail-width)] flex-col gap-2 overflow-y-auto rounded-[30px] p-2 lg:flex [scrollbar-width:none]",
            overlay ? "glass-forest top-[150px]" : "band top-[108px] shadow-lift",
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
          <div className="mt-1 grid gap-1 border-t border-[rgba(238,240,234,0.14)] pt-2">
            {railExpanded ? (
              <button
                type="button"
                onClick={toggleRail}
                aria-expanded={true}
                className="flex h-11 items-center gap-3 rounded-full px-3 text-[13px] font-medium text-on-forest-muted hover:bg-[rgba(238,240,234,0.1)] hover:text-on-forest"
              >
                <PanelLeftClose className="size-[18px] shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate text-left">Collapse</span>
              </button>
            ) : (
              <Tip label="Expand the menu">
                <button
                  type="button"
                  onClick={toggleRail}
                  aria-expanded={false}
                  aria-label="Expand the menu"
                  className="grid size-11 place-items-center rounded-full text-on-forest-muted hover:bg-[rgba(238,240,234,0.1)] hover:text-on-forest"
                >
                  <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
                </button>
              </Tip>
            )}
            <ThemeToggle compact={!railExpanded} tone="rail" />
          </div>
        </nav>

        <main
          id="main"
          className={cn(
            "mobile-bar-space",
            !overlay && "px-4 pt-6 pb-16 sm:px-6 lg:pr-8 lg:pl-[var(--rail-pad)]",
          )}
        >
          {children}
        </main>

        <FirstRunWelcome audience="desk" />
        <DeskBottomBar onMore={() => setMenuOpen(true)} />
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
