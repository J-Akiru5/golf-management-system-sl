import type { ReactNode } from "react";
import { HelpButton } from "@/components/help";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { t as defaultT, type Translate } from "@/lib/i18n/t";
import { PublicNav } from "./PublicNav";

/**
 * The TeeLine header every public player page wears.
 *
 * A player who lands on one public page from a shared link needs the same way round the club as a
 * player who started at the home page, so the logo, the club name, the shared player nav and, where
 * the page has help content, the help button arrive together. `children` is the page's own overline,
 * title and standfirst, which keeps each page's words without rebuilding the chrome.
 *
 * `nav={false}` is for the entry form: a task the player came to finish, where a global nav beside
 * the submit button only invites them to leave with the form half filled. `homeSection` marks the
 * home link as the current location on pages the nav has no item for, such as the FAQ and the legal
 * pages.
 */
export function PublicHeader({
  current,
  label,
  t = defaultT,
  help,
  nav = true,
  homeSection = false,
  children,
}: {
  current: string;
  label: string;
  /** Defaults to English: the 404 and error surfaces render outside the locale provider. */
  t?: Translate;
  help?: "pairings" | "my";
  nav?: boolean;
  homeSection?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="public-head">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TeeLineLogo variant="reverse" width={172} />
          <span className="leading-tight">
            <b className="block font-display text-[13px] font-semibold">{label}</b>
            <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
          </span>
        </div>
        {help ? <HelpButton audience="player" screen={help} /> : null}
      </div>
      {nav ? <PublicNav current={current} t={t} homeSection={homeSection} /> : null}
      {children}
    </header>
  );
}
