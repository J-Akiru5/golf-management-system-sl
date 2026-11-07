import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FirstRunWelcome, HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { SignOutForm } from "@/components/SignOutForm";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { I18nProvider } from "@/lib/i18n/context";
import { getI18n } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: { default: "My golf", template: "%s | TeeLine Golf" },
  description: "Your entry, your tee and your start, for the events you are in.",
};

/**
 * The player area. No desk chrome and no desk data: everything on these pages comes from the
 * signed-in player's own record through the portal functions. The language is read once here and
 * handed to the provider, so the header and the page inside speak the same language.
 */
export default async function PlayerLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <I18nProvider locale={locale}>
      <div lang={locale} className="grid min-h-dvh content-start">
        {/* One 56px row on a phone: logo left, help and language right. The page title, "All
            pairings" and sign-out only appear where there is room, because the bottom tab bar and
            the Profile page already cover them on a phone. */}
        <header className="band sticky top-0 z-30 flex min-h-14 items-center gap-2 px-3 pt-[env(safe-area-inset-top)] sm:gap-5 sm:px-6">
          <Link
            href="/"
            aria-label="TeeLine Golf"
            className="flex min-h-11 items-center no-underline"
          >
            <TeeLineLogo variant="reverse" width={172} className="h-auto w-[124px] sm:w-[172px]" />
          </Link>
          <span className="hidden text-sm font-semibold sm:inline">{t("player.title")}</span>
          <span className="flex-1" />
          <nav aria-label="Player" className="flex items-center gap-1 text-sm sm:gap-3">
            <Link
              href="/pairings"
              data-help="my-pairings"
              className="hidden min-h-11 items-center px-2 text-on-forest no-underline hover:underline lg:inline-flex"
            >
              {t("player.nav.allPairings")}
            </Link>
            <HelpButton audience="player" screen="my" />
            <LanguageSwitcher tone="on-forest" compact />
            {isSupabaseConfigured() && (
              <SignOutForm className="btn small ghost hidden !border-on-forest-muted lg:inline-flex" />
            )}
          </nav>
        </header>
        <main className="public mobile-bar-space">{children}</main>
        <FirstRunWelcome audience="player" />
        <PlayerBottomBar />
        <InstallPrompt />
      </div>
    </I18nProvider>
  );
}
