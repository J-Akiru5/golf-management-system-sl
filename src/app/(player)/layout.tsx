import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FirstRunWelcome, HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { OnboardingGate } from "@/components/onboarding";
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
        <header className="band flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center no-underline">
            <TeeLineLogo variant="reverse" width={172} />
          </Link>
          <span className="text-sm font-semibold">{t("player.title")}</span>
          <span className="flex-1" />
          <nav aria-label="Player" className="flex flex-wrap items-center gap-4 text-sm">
            <Link
              href="/pairings"
              data-help="my-pairings"
              className="text-on-forest no-underline hover:underline"
            >
              {t("player.nav.allPairings")}
            </Link>
            <HelpButton audience="player" screen="my" />
            <LanguageSwitcher tone="on-forest" />
            {isSupabaseConfigured() && (
              <SignOutForm className="btn small ghost !border-on-forest-muted" />
            )}
          </nav>
        </header>
        <main className="public mobile-bar-space">{children}</main>
        <OnboardingGate role="player" />
        <FirstRunWelcome audience="player" />
        <PlayerBottomBar />
        <InstallPrompt />
      </div>
    </I18nProvider>
  );
}
