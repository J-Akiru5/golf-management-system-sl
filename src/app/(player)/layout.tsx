import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PlayerBottomBar, PlayerDesktopNav } from "@/components/MobileTabBar";
import { OnboardingGate } from "@/components/onboarding";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { SignOutForm } from "@/components/SignOutForm";
import { AppTopBar } from "@/components/ui/AppTopBar";
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
        {/* The same top bar as the organizer desk and the staff app: wordmark, Help, the theme
            control, language and a round account chip that opens Profile. "All pairings" and
            sign-out only appear where there is room; the tab bar and Profile cover them. */}
        <AppTopBar
          homeHref="/"
          help={{ audience: "player", screen: "my" }}
          language
          account={{ label: t("player.tab.me"), href: "/my/profile" }}
          extra={
            <>
              <Link
                href="/pairings"
                data-help="my-pairings"
                className="hidden min-h-11 items-center px-2 text-sm text-on-forest no-underline hover:underline lg:inline-flex"
              >
                {t("player.nav.allPairings")}
              </Link>
              {isSupabaseConfigured() && (
                <SignOutForm className="btn small ghost hidden !border-on-forest-muted lg:inline-flex" />
              )}
            </>
          }
        />
        {/* From 1024px the phone bar is hidden, so these become a row under the top bar. Same
            destinations, plus the card and the course map the phone bar has no room for. */}
        <PlayerDesktopNav
          labels={{
            navigation: t("player.app.tiles"),
            home: t("player.title"),
            pairings: t("player.tab.pairings"),
            board: t("player.board.title"),
            card: t("player.scorecard.heading"),
            course: t("player.course.title"),
            profile: t("player.profile.title"),
          }}
        />
        <main className="public player-main mobile-bar-space">{children}</main>
        <OnboardingGate role="player" />
        <PlayerBottomBar />
        <InstallPrompt />
      </div>
    </I18nProvider>
  );
}
