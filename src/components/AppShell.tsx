"use client";

import {
  Bell,
  CircleUserRound,
  Download,
  Flag,
  LayoutGrid,
  Map as MapIcon,
  Menu,
  MonitorPlay,
  Search,
  SlidersHorizontal,
  Smartphone,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tip, TooltipProvider } from "@/components/ui/tooltip";
import { validateDraw } from "@/lib/draw/validate";
import { fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  /** Alert dot: only for blocking work waiting on that page. */
  alert?: boolean;
}

const isCurrent = (path: string, href: string) =>
  href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

/**
 * Application shell from the approved mockup: a top bar (TeeLine mark, search, current
 * event, alerts, account) and a left rail. On the overview it floats as glass over the course map;
 * on working pages it sits on the club's forest band. Below 1024px the rail becomes a labelled
 * menu sheet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const overlay = path === "/admin";
  const { state, registrations, names } = useDesk();
  const [menuOpen, setMenuOpen] = useState(false);

  const blocking = useMemo(() => {
    if (!state.draw) return 0;
    return validateDraw({
      draw: state.draw,
      registrations,
      config: state.config,
      engineWarnings: state.drawWarnings,
      names,
    }).filter((i) => i.severity === "blocking").length;
  }, [state.draw, registrations, state.config, state.drawWarnings, names]);
  const review = registrations.filter((r) => r.status === "needs_review").length;

  const nav: NavItem[] = [
    { href: "/admin", label: "Control room", icon: LayoutGrid },
    { href: "/players", label: "Players", icon: Users, alert: review > 0 },
    { href: "/draw", label: "Draw & pairings", icon: Flag, alert: blocking > 0 },
    { href: "/course", label: "Course & holes", icon: MapIcon },
    { href: "/import", label: "Handicap import", icon: Download },
    { href: "/spotlight", label: "Clubhouse display", icon: MonitorPlay },
    { href: "/pairings", label: "Player view", icon: Smartphone },
    { href: "/setup", label: "Setup", icon: SlidersHorizontal },
  ];

  const startLabel =
    state.config.startFormat === "shotgun"
      ? `Shotgun · ${fmtTime(state.config.firstTeeTime)}`
      : `Two-tee · ${fmtTime(state.config.firstTeeTime)}`;

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
                {nav.map((n) => {
                  const on = isCurrent(path, n.href);
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex h-11 items-center gap-3 rounded-md px-3 font-medium text-ink no-underline",
                        on ? "bg-gold text-on-gold" : "hover:bg-surface-sunken",
                      )}
                    >
                      <n.icon className="size-[18px]" aria-hidden="true" />
                      <span className="flex-1">{n.label}</span>
                      {n.alert && (
                        <span className="pill bad" title="Needs attention">
                          Check
                        </span>
                      )}
                    </Link>
                  );
                })}
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

          <Link
            href="/draw"
            className={cn(
              "hidden h-12 min-w-0 items-center gap-2.5 rounded-full py-0 pr-4 pl-2 text-[13px] text-ink no-underline xl:flex",
              overlay ? "glass" : "border border-[rgba(238,240,234,0.18)] bg-[rgba(0,0,0,0.12)]",
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold text-on-gold">
              <Flag className="size-4" aria-hidden="true" />
            </span>
            <b className="truncate font-display">{state.name}</b>
            <span className="shrink-0 text-ink-muted tnum">{startLabel}</span>
          </Link>

          <span className="flex-1" />

          <span
            className="hidden h-8 shrink-0 items-center rounded-full bg-gold-soft px-3 text-xs font-semibold whitespace-nowrap text-gold-ink md:inline-flex"
            title="Sample players and placeholder tee ratings. Nothing is saved yet; a refresh resets everything."
          >
            Demo data · not saved
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
              "hidden h-[52px] shrink-0 items-center gap-2.5 rounded-full py-0 pr-4 pl-1.5 md:flex",
              overlay ? "glass" : "border border-[rgba(238,240,234,0.18)]",
            )}
          >
            <span className="grid size-10 place-items-center rounded-full border border-gold bg-forest text-gold">
              <CircleUserRound className="size-5" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <b className="block text-sm whitespace-nowrap text-ink">Demo organizer</b>
              <small className="text-[11px] whitespace-nowrap text-ink-muted">
                Demo · no sign-in yet
              </small>
            </span>
          </span>
        </header>

        <nav
          aria-label="Main"
          className={cn(
            "shell-chrome fixed left-6 z-30 hidden w-[60px] flex-col gap-2 rounded-[30px] p-2 lg:flex",
            overlay ? "glass top-[150px]" : "band top-[108px] shadow-lift",
          )}
        >
          {nav.map((n) => {
            const on = isCurrent(path, n.href);
            return (
              <Tip key={n.href} label={n.label}>
                <Link
                  href={n.href}
                  aria-label={n.label}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative grid size-11 place-items-center rounded-full transition-colors",
                    on
                      ? "bg-gold text-on-gold"
                      : "text-on-forest-muted hover:bg-[rgba(238,240,234,0.1)] hover:text-on-forest",
                  )}
                >
                  <n.icon className="size-5" aria-hidden="true" />
                  {n.alert && (
                    <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger shadow-[0_0_0_2px_#1a2a21]" />
                  )}
                </Link>
              </Tip>
            );
          })}
          <div className="mt-1 border-t border-[rgba(238,240,234,0.14)] pt-2">
            <ThemeToggle compact />
          </div>
        </nav>

        <main id="main" className={cn(!overlay && "px-4 pt-6 pb-16 sm:px-6 lg:pr-8 lg:pl-[112px]")}>
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
