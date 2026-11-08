import type { Metadata } from "next";
import Link from "next/link";
import { HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { PairingsView, type PairingsYou } from "@/components/PairingsView";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import {
  PlayerDirectory,
  ProgrammeNav,
  RulesOfPlay,
  TeeTimesBoard,
} from "@/components/public/ProgrammeView";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { fmtDateLabel, fmtRange } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import { loadPublicPairings } from "@/lib/data/supabase/public-pairings";
import { loadPublicProgramme } from "@/lib/data/supabase/public-programme";
import { fmtTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { loadPortal } from "@/lib/player/portal";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DemoPairings } from "./DemoPairings";

export const metadata: Metadata = {
  title: "Tee times, players and pairings",
  description:
    "The published programme for the club's tournament: the confirmed tee times for each playing day, the player list and the pairings, plus the organizers' rules of play. No account needed.",
  alternates: { canonical: "/pairings" },
  openGraph: openGraphFor({
    title: `Tee times, players and pairings | ${SITE_NAME}`,
    description:
      "Confirmed tee times by day, the player list, the published pairings and the rules of play. No account needed.",
    path: "/pairings",
  }),
  twitter: twitterFor({
    title: `Tee times, players and pairings | ${SITE_NAME}`,
    description:
      "Confirmed tee times by day, the player list, the published pairings and the rules.",
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
 *
 * The pairings come from the frozen published snapshot. The day schedule, the player cards and the
 * rules are reference data read through `public_programme()`, which only answers while the event is
 * published; a time that the desk has not confirmed is never part of that projection.
 */
const manila = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

/**
 * Who is reading, when they are signed in. The page is public, so a failed lookup is silent: it
 * only costs the "You" marker, never the pairings.
 */
async function loadSignedInPlayer(): Promise<PairingsYou | null> {
  try {
    const client = await createSupabaseServerClient();
    const { data } = await client.auth.getUser();
    if (!data.user) return null;
    const portal = await loadPortal(client);
    return portal.player ? { id: portal.player.id, name: portal.player.name } : null;
  } catch {
    return null;
  }
}

export default async function PublicPairingsPage() {
  const { t } = await getI18n();
  if (!isSupabaseConfigured()) return <DemoPairings />;

  const client = createSupabasePublicClient();
  // The signed-in lookup runs alongside the public reads: it never delays the pairings.
  const signedIn = loadSignedInPlayer();
  let data: Awaited<ReturnType<typeof loadPublicPairings>> = null;
  let programme: Awaited<ReturnType<typeof loadPublicProgramme>> = null;
  let failed = false;
  // The programme is additive: a database that has not applied its migration yet still serves the
  // pairings, because the failed read only costs the extra sections.
  const [pairingsResult, programmeResult] = await Promise.allSettled([
    loadPublicPairings(client),
    loadPublicProgramme(client),
  ]);
  if (pairingsResult.status === "fulfilled") data = pairingsResult.value;
  else failed = true;
  if (programmeResult.status === "fulfilled") programme = programmeResult.value;
  const you = await signedIn;

  const published = data?.published ?? null;
  const dates = programme?.days.length
    ? programme.days.map((day) => day.playDate)
    : data
      ? [data.date]
      : [];
  const dateLabel = dates.length > 1 ? fmtRange(dates) : fmtDateLabel(dates);
  const pairings =
    data && published
      ? toPublicPairings({
          published,
          tournamentName: data.name,
          dateLabel,
          startFormat: data.startFormat,
          firstTeeTime: data.firstTeeTime,
          photoByPlayerId: data.photoByPlayerId,
        })
      : null;
  const showProgramme = Boolean(pairings && published && programme);
  const skippedRows = data?.skippedRows ?? 0;

  return (
    <main className="public public-pairings mobile-bar-space">
      <PlayerOfflineNotice path="/pairings" />
      <header className="public-head !p-4 sm:!p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={144} />
            <span className="leading-tight">
              <b className="block font-display text-[13px] font-semibold">{t("pairings.title")}</b>
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher tone="on-forest" />
            <HelpButton audience="player" screen="pairings" />
          </div>
        </div>
        {data && (
          <>
            <p className="overline mt-2 !text-gold-on-forest">
              {data.startFormat === "shotgun" ? t("pairings.shotgun") : t("pairings.twoTee")} ·{" "}
              {fmtTime(data.firstTeeTime)}
            </p>
            <h1 className="font-serif text-[25px] leading-8 font-semibold !text-on-forest sm:text-[40px] sm:leading-[44px] lg:text-[52px] lg:leading-[56px]">
              {data.name}
            </h1>
            <p className="text-on-forest-muted">{dateLabel}</p>
          </>
        )}
      </header>

      {failed ? (
        <div className="notice grid gap-3" role="status">
          <p className="m-0">
            <b>{t("pairings.failedTitle")}</b> {t("pairings.failedBody")}
          </p>
          <a className="btn ghost no-print justify-self-start" href="/pairings">
            {t("pairings.retry")}
          </a>
        </div>
      ) : !pairings || !published ? (
        <section className="pairings-empty" role="status">
          <h2>{t("pairings.notOutTitle")}</h2>
          <p>{t("pairings.notOutBody")}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link className="btn ghost no-print" href="/pairings#tee-times">
              {t("programme.navTeeTimes")}
            </Link>
            <Link className="btn ghost no-print" href="/">
              {t("pairings.home")}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {showProgramme && programme && <ProgrammeNav programme={programme} hasPairings />}

          <section
            className="grid gap-3"
            id="pairings"
            style={{ scrollMarginTop: "calc(7rem + env(safe-area-inset-top, 0px))" }}
          >
            <div>
              <h2 className="text-[20px] leading-7">{t("programme.navPairings")}</h2>
              <p className="hint no-print" data-testid="pairings-version">
                {published.version
                  ? t("pairings.version", {
                      version: published.version,
                      when: manila.format(new Date(published.at)),
                    })
                  : t("pairings.versionNoNumber", {
                      when: manila.format(new Date(published.at)),
                    })}
              </p>
            </div>
            {skippedRows > 0 && (
              <p className="notice warn no-print" role="status" data-testid="pairings-skipped">
                Part of the published draw could not be read.{" "}
                {skippedRows === 1 ? "1 row is" : `${skippedRows} rows are`} not shown.
              </p>
            )}
            <PairingsView pairings={pairings} headingLevel="section" flightFilter you={you} />
          </section>

          {showProgramme && programme && (
            <>
              <TeeTimesBoard programme={programme} />
              <PlayerDirectory programme={programme} />
            </>
          )}

          {showProgramme && programme?.rulesOfPlay && <RulesOfPlay text={programme.rulesOfPlay} />}
        </>
      )}

      <p className="hint no-print">
        {t("pairings.footer")} <Link href="/">{t("pairings.home")}</Link> ·{" "}
        <Link href="/leaderboard">Leaderboard</Link>
      </p>
      <PlayerBottomBar />
    </main>
  );
}
