import type { Metadata } from "next";
import Link from "next/link";
import { HelpButton } from "@/components/help";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { PairingsView } from "@/components/PairingsView";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { fmtDateLabel } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import { loadPublicPairings } from "@/lib/data/supabase/public-pairings";
import { fmtTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { DemoPairings } from "./DemoPairings";

export const metadata: Metadata = {
  title: "Published player pairings",
  description:
    "The published pairings for the club's tournament: name, flight, hole or tee and start time. No account needed, and the version number can be checked against a printed copy.",
  alternates: { canonical: "/pairings" },
  openGraph: openGraphFor({
    title: `Published player pairings | ${SITE_NAME}`,
    description:
      "Name, flight, hole or tee and start time, from the published version. No account needed.",
    path: "/pairings",
  }),
  twitter: twitterFor({
    title: `Published player pairings | ${SITE_NAME}`,
    description: "Name, flight, hole or tee and start time, from the published version.",
  }),
};

/**
 * The page players open. Built on the server from the published version in the database, with no
 * login.
 *
 * It reads the saved language from a cookie, so it renders per request instead of being cached for
 * a minute. That is deliberate: showing a Hiligaynon reader an English page (or the other way
 * round) is worse than a database round trip at this club's size. The organizer's publish action
 * still refreshes whatever is cached around the pairings.
 */
const manila = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export default async function PublicPairingsPage() {
  const { t } = await getI18n();
  if (!isSupabaseConfigured()) return <DemoPairings />;

  let data: Awaited<ReturnType<typeof loadPublicPairings>> = null;
  let failed = false;
  try {
    data = await loadPublicPairings(createSupabasePublicClient());
  } catch {
    failed = true;
  }

  const published = data?.published ?? null;
  const pairings =
    data && published
      ? toPublicPairings({
          published,
          tournamentName: data.name,
          dateLabel: fmtDateLabel([data.date]),
          startFormat: data.startFormat,
          firstTeeTime: data.firstTeeTime,
        })
      : null;

  return (
    <div className="public public-pairings mobile-bar-space">
      <PlayerOfflineNotice path="/pairings" />
      <header className="public-head">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={172} />
            <span className="leading-tight">
              <b className="block font-display text-[13px] font-semibold">{t("pairings.title")}</b>
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <HelpButton audience="player" screen="pairings" />
        </div>
        {data && (
          <>
            <p className="overline mt-3 !text-gold">
              {data.startFormat === "shotgun" ? t("pairings.shotgun") : t("pairings.twoTee")} ·{" "}
              {fmtTime(data.firstTeeTime)}
            </p>
            <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px] lg:text-[56px] lg:leading-[60px]">
              {data.name}
            </h1>
            <p className="text-on-forest-muted">{fmtDateLabel([data.date])}</p>
          </>
        )}
      </header>

      {failed ? (
        <div className="notice" role="status">
          <b>{t("pairings.failedTitle")}</b> {t("pairings.failedBody")}
        </div>
      ) : !pairings || !published ? (
        <section className="pairings-empty" role="status">
          <h2>{t("pairings.notOutTitle")}</h2>
          <p>{t("pairings.notOutBody")}</p>
        </section>
      ) : (
        <>
          <p className="hint no-print" data-testid="pairings-version">
            {published.version
              ? t("pairings.version", {
                  version: published.version,
                  when: manila.format(new Date(published.at)),
                })
              : t("pairings.versionNoNumber", { when: manila.format(new Date(published.at)) })}
          </p>
          <PairingsView pairings={pairings} headingLevel="section" flightFilter />
        </>
      )}

      <p className="hint no-print">
        {t("pairings.footer")} <Link href="/">{t("pairings.home")}</Link>
      </p>
      <PlayerBottomBar />
    </div>
  );
}
