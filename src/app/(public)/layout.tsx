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
        <footer className="no-print mobile-bar-space bg-forest px-4 pt-4 text-on-forest lg:pb-6">
          <nav
            aria-label={t("feedback.footerLabel")}
            className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px]"
          >
            <Link href="/" className="text-on-forest-muted no-underline hover:text-on-forest">
              {t("pairings.home")}
            </Link>
            <FeedbackLink />
          </nav>
        </footer>
        <InstallPrompt />
      </I18nProvider>
    </div>
  );
}
