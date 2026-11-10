import type { Metadata } from "next";
import Link from "next/link";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { FeedbackForm } from "@/components/public/FeedbackForm";
import { PublicBackLink } from "@/components/public/PublicBackLink";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { normalizePagePath } from "@/lib/data/feedback";
import { getI18n } from "@/lib/i18n/server";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Send feedback",
  description:
    "Tell Iloilo Golf and Country Club about a problem, a wrong page or an improvement. The note goes to the organizer's private desk.",
  alternates: { canonical: "/feedback" },
  openGraph: openGraphFor({
    title: `Send feedback | ${SITE_NAME}`,
    description:
      "Tell the club about a problem or an improvement. The note goes to the organizer's private desk.",
    path: "/feedback",
  }),
  twitter: twitterFor({
    title: `Send feedback | ${SITE_NAME}`,
    description: "A problem or an improvement? Tell the club. Your note is private to staff.",
  }),
};

/**
 * The public feedback page.
 *
 * It shows a form and nothing else: no submission is ever read back here. `?from=` carries the page
 * the visitor came from, and it is reduced to a single path before the form sends it. The form's
 * own words come from the dictionary, so the page works in English, Tagalog and Hiligaynon.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ t }, params] = await Promise.all([getI18n(), searchParams]);
  const from = Array.isArray(params.from) ? params.from[0] : params.from;
  const sourcePath = normalizePagePath(from);

  return (
    <main className="public mobile-bar-space">
      <header className="public-head">
        <PublicBackLink label={t("feedback.backHome")} />
        <div className="flex flex-wrap items-center gap-3">
          <TeeLineLogo variant="reverse" width={172} />
          <span className="leading-tight">
            <b className="block font-display text-[13px] font-semibold">TeeLine Golf</b>
            <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
          </span>
        </div>
        <p className="overline mt-3 !text-gold-on-forest">{t("feedback.overline")}</p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          {t("feedback.title")}
        </h1>
        <p className="text-on-forest-muted">{t("feedback.intro")}</p>
      </header>

      <FeedbackForm sourcePath={sourcePath} />

      <p className="hint no-print">
        <Link href="/">{t("pairings.home")}</Link>
        {" · "}
        <Link href="/privacy">Privacy policy</Link>
      </p>
      <PlayerBottomBar />
    </main>
  );
}
