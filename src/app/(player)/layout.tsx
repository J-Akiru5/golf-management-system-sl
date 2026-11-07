import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FirstRunWelcome, HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { I18nProvider } from "@/lib/i18n/context";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: { default: "My golf", template: "%s | TeeLine Golf" },
  description: "Your entry, your tee and your start, for the events you are in.",
};

/**
 * The player area. No desk chrome and no desk data: everything on these pages comes from the
 * signed-in player's own record through the portal functions. The language is read once here and
 * handed to the provider, so the header and the page inside speak the same language.
 *
 * The phone header is one short row: wordmark, help and language. Everything else moved out of it
 * on purpose. Pairings has a tab, and signing out lives on Me, so the header never wraps and never
 * pushes the page down. Sign-out deliberately stays reachable to a player whose record is not
 * linked: Me still renders for them.
 */
export default async function PlayerLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <I18nProvider locale={locale}>
      <div lang={locale} className="player-shell grid min-h-dvh content-start">
        <header className="band player-header">
          <div className="mx-auto flex w-full max-w-[56rem] items-center gap-2">
            <Link href="/" className="inline-flex min-h-11 items-center no-underline">
              <TeeLineLogo variant="reverse" width={132} />
            </Link>
            <span className="sr-only">{t("player.title")}</span>
            <span className="flex-1" />
            <nav aria-label="Player" className="flex items-center gap-1">
              <Link
                href="/pairings"
                data-help="my-pairings"
                className="hidden min-h-11 items-center px-1 text-sm text-on-forest no-underline hover:underline sm:inline-flex"
              >
                {t("player.nav.allPairings")}
              </Link>
              <HelpButton audience="player" screen="my" />
              <span data-onboard="language">
                <LanguageSwitcher tone="on-forest" />
              </span>
            </nav>
          </div>
        </header>
        <main className="public player-main mobile-bar-space">{children}</main>
        <FirstRunWelcome audience="player" />
        <PlayerBottomBar />
        <InstallPrompt />
      </div>
    </I18nProvider>
  );
}
