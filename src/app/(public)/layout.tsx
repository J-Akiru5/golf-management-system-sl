import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FeedbackLink } from "@/components/public/FeedbackLink";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { I18nProvider } from "@/lib/i18n/context";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: { default: "Player pairings", template: "%s | TeeLine Golf" },
};

/**
 * Public pages read the saved language (or the browser's preference) once, hand it to the client
 * provider, and mark the region with the right `lang`. Reading the cookie makes these pages render
 * per request; that is the price of not sending a visitor to a URL in a language they cannot read.
 *
 * The footer carries the feedback link on every public page. It is a plain anchor, so it keeps
 * working without JavaScript.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <div lang={locale}>
      <I18nProvider locale={locale}>
        {children}
        <footer className="public-footbar no-print mobile-bar-space bg-forest px-4 pt-5 text-on-forest lg:pb-6">
          <nav
            aria-label={t("feedback.footerLabel")}
            className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[14px] font-semibold tracking-[0.12em]"
          >
            <Link
              href="/"
              className="inline-flex min-h-11 items-center text-on-forest underline-offset-4 no-underline hover:text-gold-on-forest hover:underline"
            >
              {t("pairings.home")}
            </Link>
            <span aria-hidden="true" className="size-1 rounded-full bg-gold-on-forest/60" />
            <FeedbackLink className="inline-flex min-h-11 items-center text-gold-on-forest no-underline underline-offset-4 hover:text-on-forest hover:underline" />
          </nav>
        </footer>
        <InstallPrompt />
      </I18nProvider>
    </div>
  );
}
