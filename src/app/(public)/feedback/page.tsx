import type { Metadata } from "next";
import { PublicBottomBar } from "@/components/MobileTabBar";
import { FeedbackForm } from "@/components/public/FeedbackForm";
import { normalizeFeedbackTournamentId, normalizePagePath } from "@/lib/data/feedback";
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
 * the visitor came from, and it is reduced to a single path before the form sends it. `?event=`
 * carries an optional public event id; only a UUID shape is passed on, and the database checks the
 * club and public visibility. The form's own words come from the dictionary, so the page works in
 * English, Tagalog and Hiligaynon.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; event?: string | string[] }>;
}) {
  const [{ t }, params] = await Promise.all([getI18n(), searchParams]);
  const from = Array.isArray(params.from) ? params.from[0] : params.from;
  const sourcePath = normalizePagePath(from);
  const eventParam = Array.isArray(params.event) ? params.event[0] : params.event;
  const tournamentId = normalizeFeedbackTournamentId(eventParam);

  return (
    <main className="public mobile-bar-space">
      <header className="public-head tl-pub-page-head">
        <p className="tl-pub-kicker">{t("feedback.overline")}</p>
        <h1 className="tl-pub-title">{t("feedback.title")}</h1>
        <p className="tl-pub-intro">{t("feedback.intro")}</p>
      </header>

      <FeedbackForm sourcePath={sourcePath} tournamentId={tournamentId} />
      <PublicBottomBar />
    </main>
  );
}
