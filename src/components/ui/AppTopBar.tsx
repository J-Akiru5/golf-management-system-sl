"use client";

import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { HelpAudience } from "@/lib/help/types";
import { cn } from "@/lib/ui/cn";

/**
 * The top bar of the player and staff apps, built from the same pieces as the organizer desk's bar
 * (the forest band, the wordmark, Help, the theme control and a round account chip), so all three
 * areas feel like one product. On a phone it is a single 56px row; the desk's search, event picker
 * and alerts are left out because a golfer or a volunteer never needs them there.
 *
 * Nothing here knows who is signed in. The caller passes the account label and what tapping the
 * chip does, so the staff app can open its account sheet and the player app can open Profile.
 */
export function AppTopBar({
  homeHref,
  title,
  subtitle,
  help,
  language = false,
  account,
  extra,
  className,
}: {
  homeHref: string;
  /** A short line after the wordmark, such as the event name. Truncates, never wraps. */
  title?: string;
  subtitle?: string;
  help: { audience: HelpAudience; screen: string };
  /** The player area offers the language picker; the staff app is English only. */
  language?: boolean;
  account: {
    label: string;
    /** Up to two letters shown in the chip instead of the icon. */
    initials?: string;
    /** A link target, or a handler that opens a sheet. One of them. */
    href?: string;
    onClick?: () => void;
    dataOnboard?: string;
  };
  /** Controls that only fit on a wide screen, such as "All pairings" or sign out. */
  extra?: ReactNode;
  className?: string;
}) {
  const chip = (
    <>
      {account.initials ? (
        <span aria-hidden="true" className="text-[13px] font-bold tracking-wide">
          {account.initials}
        </span>
      ) : (
        <CircleUserRound className="size-5" aria-hidden="true" />
      )}
    </>
  );
  const chipClass =
    "grid size-11 shrink-0 place-items-center rounded-full border border-gold bg-forest text-gold no-underline hover:bg-[rgba(238,240,234,0.1)]";

  // The desk shell mounts the tooltip provider; the player and staff layouts do not, and the Help
  // button needs one, so the bar brings its own.
  return (
    <TooltipProvider delayDuration={150}>
      <header
        className={cn(
          "shell-chrome band sticky top-0 z-30 flex min-h-14 items-center gap-1.5 px-3 pt-[env(safe-area-inset-top)] shadow-card sm:gap-3 sm:px-6",
          className,
        )}
      >
        <Link
          href={homeHref}
          aria-label="TeeLine Golf"
          className="flex min-h-11 shrink-0 items-center no-underline"
        >
          <TeeLineLogo variant="reverse" width={172} className="h-auto w-[112px] sm:w-[172px]" />
        </Link>

        {title ? (
          <span className="grid min-w-0 flex-1 leading-tight">
            <b className="truncate text-[13px] font-semibold text-on-forest sm:text-sm">{title}</b>
            {subtitle && (
              <span className="truncate text-[11px] text-on-forest-muted sm:text-xs">
                {subtitle}
              </span>
            )}
          </span>
        ) : (
          <span className="flex-1" />
        )}

        <nav aria-label="Top bar" className="flex shrink-0 items-center gap-0.5 sm:gap-2">
          {extra}
          <HelpButton audience={help.audience} screen={help.screen} />
          <ThemeToggle compact tone="rail" />
          {language && (
            <span data-onboard="language">
              <LanguageSwitcher tone="on-forest" compact />
            </span>
          )}
          {account.href ? (
            <Link
              href={account.href}
              aria-label={account.label}
              data-onboard={account.dataOnboard}
              className={chipClass}
            >
              {chip}
            </Link>
          ) : (
            <button
              type="button"
              aria-label={account.label}
              data-onboard={account.dataOnboard}
              onClick={account.onClick}
              className={chipClass}
            >
              {chip}
            </button>
          )}
        </nav>
      </header>
    </TooltipProvider>
  );
}
