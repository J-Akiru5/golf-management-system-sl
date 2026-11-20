import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PublicBottomBar } from "@/components/MobileTabBar";
import { PairingsView, type PairingsYou } from "@/components/PairingsView";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import { HeldNotice } from "@/components/public/HeldNotice";
import { PairingsLive } from "@/components/public/PairingsLive";
import { PlayerProfileSearch } from "@/components/public/PlayerProfileSearch";
import { PlayerProfileView } from "@/components/public/PlayerProfileView";
import { RulesOfPlay } from "@/components/public/ProgrammeView";
import { PublicAdvisoryBanner } from "@/components/public/PublicAdvisoryBanner";
import { PublicBackLink } from "@/components/public/PublicBackLink";
import { PublicTournamentNav } from "@/components/public/PublicTournamentNav";
import { ResultsHolding } from "@/components/public/ResultsHolding";
import { JsonLd } from "@/components/seo/JsonLd";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fmtDateLabel, fmtRange } from "@/lib/data/labels";
import { type PublicReleaseState, toPublicPairings } from "@/lib/data/public";
import { loadPublicPlayerProfile, type PublicPlayerProfileData } from "@/lib/data/public-profile";
import { parsePublicTab } from "@/lib/data/public-tabs";
import {
  applyLiveClasses,
  buildTeamLeaderboard,
  liveClassesFromProgramme,
  type PublicTeamStanding,
} from "@/lib/data/public-team-leaderboard";
import {
  readPublicAdvisory,
  readPublicPairings,
  readPublicProgramme,
  readPublicReleaseState,
  readPublicRevealState,
  readPublicTeamLeaderboard,
} from "@/lib/data/supabase/public-cache";
import { fmtTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { loadPortal } from "@/lib/player/portal";
import { advisoryForToday, type PublicAdvisory } from "@/lib/public/advisory";
import { pairingsSignature } from "@/lib/public/pairings-live";
import { pairingsBackLink } from "@/lib/public/pairings-nav";
import { publicProfileTeeTimes } from "@/lib/public/public-profile-tee-times";
import { blackoutFlags } from "@/lib/public/results-reveal";
import { openGraphFor, SITE_NAME, twitterFor, webPageSchema } from "@/lib/seo";
import { hasSupabaseAuthCookie } from "@/lib/supabase/cookies";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DemoPairings } from "./DemoPairings";

export const metadata: Metadata = {
  title: "Pairings, players and scores",
  description:
    "The published programme for the club's tournament: the pairings, the confirmed tee times, the player list, each player's published scorecard and the cumulative team leaderboard. No account needed.",
  alternates: { canonical: "/pairings" },
  openGraph: openGraphFor({
    title: `Pairings, players and scores | ${SITE_NAME}`,
    description:
      "The pairings, the player list, published scorecards and the cumulative team leaderboard. No account needed.",
    path: "/pairings",
  }),
  twitter: twitterFor({
    title: `Pairings, players and scores | ${SITE_NAME}`,
    description: "The pairings, the player list, published scorecards and the team leaderboard.",
  }),
};

/**
 * The page players open. Built on the server from the published version in the database, with no
 * login.
 *
 * It reads the saved language from a cookie, so it renders per request instead of being cached for
 * a minute. That is deliberate: showing a Hiligaynon reader an English page (or the other way
 * round) is worse than a database round trip at this club's size. What is shared between requests
 * is the data, not the page: the anonymous reads go through `public-cache`, which the desk clears
 * on a publish or a release toggle.
 *
 * The pairings come from the frozen published snapshot. The day schedule, the player cards and the
 * rules are reference data read through `public_programme()`, which only answers while the event is
 * published; a time that the desk has not confirmed is never part of that projection. The player
 * profile tab reads one player's frozen card through `public_player_scorecard()`; the leaderboard
 * lives on its own page because the team table adds every published round together.
 */
/**
 * Who is reading, when they are signed in. The page is public, so a failed lookup is silent: it
 * only costs the "You" marker, never the pairings.
 */
async function loadSignedInPlayer(): Promise<PairingsYou | null> {
  try {
    // A signed-out visitor has no Supabase session cookie. Do not spend an auth round trip on the
    // common case; only the "You" marker is at stake, never the pairings.
    const jar = await cookies();
    if (!hasSupabaseAuthCookie(jar.getAll().map((cookie) => cookie.name))) return null;

    const client = await createSupabaseServerClient();
    const { data } = await client.auth.getUser();
    if (!data.user) return null;
    const portal = await loadPortal(client);
    return portal.player ? { id: portal.player.id, name: portal.player.name } : null;
  } catch {
    return null;
  }
}

const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PublicPairingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; player?: string | string[] }>;
}) {
  const params = await searchParams;
  const tab = parsePublicTab(params.tab);
  const rawPlayerId = typeof params.player === "string" ? params.player : null;
  if (tab === "players") redirect("/roster");
  if (tab === "leaderboard") redirect("/leaderboard");

  const { t } = await getI18n();
  const back = pairingsBackLink(tab);
  if (!isSupabaseConfigured()) return <DemoPairings tab={tab} playerId={rawPlayerId} />;

  const playerId = rawPlayerId && PLAYER_ID.test(rawPlayerId) ? rawPlayerId : null;
  const client = createSupabasePublicClient();
  // The signed-in lookup runs alongside the public reads: it never delays the pairings.
  const signedIn = loadSignedInPlayer();
  let data: Awaited<ReturnType<typeof readPublicPairings>> = null;
  let programme: Awaited<ReturnType<typeof readPublicProgramme>> = null;
  let release: PublicReleaseState | null = null;
  let advisoryValue: PublicAdvisory | null = null;
  let failed = false;
  // The programme, release and advisory reads are additive: a database that has not applied their
  // migrations still serves the pairings, because the failed read only costs the extra sections.
  const [pairingsResult, programmeResult, releaseResult, advisoryResult] = await Promise.allSettled(
    [readPublicPairings(), readPublicProgramme(), readPublicReleaseState(), readPublicAdvisory()],
  );
  if (pairingsResult.status === "fulfilled") data = pairingsResult.value;
  else failed = true;
  if (programmeResult.status === "fulfilled") programme = programmeResult.value;
  if (releaseResult.status === "fulfilled") release = releaseResult.value;
  if (advisoryResult.status === "fulfilled") advisoryValue = advisoryResult.value;

  let profile: PublicPlayerProfileData | null = null;
  let team: PublicTeamStanding | null = null;
  let profileFailed = false;
  // The profile is a player's frozen card. While the desk holds the results or the player list, the
  // page asks for nothing: `public_player_scorecard()` would answer with nothing anyway, and a held
  // page must not make the request at all.
  const blackout = release?.roster === false || release?.leaderboard === false;
  if (tab === "profile" && playerId && !blackout) {
    try {
      profile = await loadPublicPlayerProfile(client, playerId);
    } catch {
      profileFailed = true;
    }
    if (profile) {
      const profilePlayerId = profile.player.id;
      try {
        const leaderboard = await readPublicTeamLeaderboard();
        if (leaderboard) {
          team =
            buildTeamLeaderboard(
              applyLiveClasses(leaderboard, liveClassesFromProgramme(programme)),
            ).teams.find((entry) => entry.playerIds.includes(profilePlayerId)) ?? null;
        }
      } catch {
        // The pair total is additive. A database without the leaderboard still shows the profile.
        team = null;
      }
    }
  }
  const you = await signedIn;

  const published = data?.published ?? null;
  const eventPublished = programme !== null || published !== null;
  const pairingsHeld = release?.pairings === false;
  const teeTimesHeld = release?.teeTimes === false;
  const rulesHeld = release?.rules === false;
  const rosterHeld = release?.roster === false;
  const leaderboardHeld = release?.leaderboard === false;
  const reveal = blackout ? await readPublicRevealState().catch(() => null) : null;
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
  const skippedRows = data?.skippedRows ?? 0;
  // What this render shows, in the same terms the version endpoint answers with. The live refresher
  // compares the two, so it reloads the page for a publish, an unpublish or a recovery from an error.
  const liveSignature = failed ? "error" : pairingsSignature(published, release);
  // The advisory is server-checked against the club's calendar day, so the client component never
  // reads a clock and cannot disagree with the server on first paint.
  const advisory = advisoryForToday(advisoryValue);

  return (
    <main className="public public-pairings mobile-bar-space">
      <JsonLd
        data={webPageSchema({
          path: "/pairings",
          name: "Pairings, players and scores",
          description:
            "The published programme: the pairings, the confirmed tee times, the player list, each player's published scorecard and the cumulative team leaderboard.",
          type: "CollectionPage",
        })}
      />
      <PlayerOfflineNotice path="/pairings" />
      <PairingsLive signature={liveSignature} />
      <header className="public-head public-appbar p-4 sm:p-5">
        {/* Inside a player's profile the way back is the pairings list; everywhere else it is the
            main page. */}
        <PublicBackLink label={t(back.labelKey)} href={back.href} />
        <div className="public-appbar-controls flex items-center gap-2">
          <ThemeToggle compact tone="nav" />
          <LanguageSwitcher tone="on-forest" />
          <HelpButton audience="player" screen="pairings" />
        </div>
        <div className="appbar-foot">
          <div className="public-appbar-brand flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={144} />
            <span className="leading-tight">
              {data && (
                <b className="block font-display text-[13px] font-semibold">
                  {t("pairings.title")}
                </b>
              )}
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <div className="appbar-title">
            {data ? (
              <>
                <p className="public-appbar-kicker overline !text-gold-on-forest">
                  {data.startFormat === "shotgun" ? t("pairings.shotgun") : t("pairings.twoTee")} ·{" "}
                  {fmtTime(data.firstTeeTime)}
                </p>
                <h1 className="font-serif text-[25px] leading-8 font-semibold !text-on-forest sm:text-[40px] sm:leading-[44px] lg:text-[52px] lg:leading-[56px]">
                  {data.name}
                </h1>
                <p className="text-on-forest-muted">{dateLabel}</p>
              </>
            ) : (
              <h1 className="font-serif text-[25px] leading-8 font-semibold !text-on-forest sm:text-[40px] sm:leading-[44px] lg:text-[52px] lg:leading-[56px]">
                {t("pairings.title")}
              </h1>
            )}
          </div>
        </div>
      </header>

      {advisory && <PublicAdvisoryBanner advisory={advisory} />}

      {failed ? (
        <div className="notice grid gap-3" role="status">
          <p className="m-0">
            <b>{t("pairings.failedTitle")}</b> {t("pairings.failedBody")}
          </p>
          <a className="btn ghost no-print justify-self-start" href="/pairings">
            {t("pairings.retry")}
          </a>
        </div>
      ) : !eventPublished ? (
        <section className="pairings-empty" role="status">
          <h2>{t("pairings.notOutTitle")}</h2>
          <p>{t("pairings.notOutBody")}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a className="btn ghost no-print" href="/pairings">
              {t("pairings.checkAgain")}
            </a>
            <Link className="btn ghost no-print" href="/">
              {t("pairings.home")}
            </Link>
          </div>
        </section>
      ) : (
        <>
          <PublicTournamentNav active={tab} />

          {tab === "profile" ? (
            rosterHeld || leaderboardHeld ? (
              <ResultsHolding
                revealAt={reveal?.revealAt ?? null}
                serverNow={new Date().toISOString()}
                held={blackoutFlags(release)}
              />
            ) : (
              <>
                {!playerId &&
                  programme &&
                  programme.players.some((player) => player.id !== null) && (
                    <PlayerProfileSearch players={programme.players} selectedId={playerId} />
                  )}
                {profileFailed ? (
                  <div className="notice" role="alert">
                    {t("programme.profileFailed")}
                  </div>
                ) : profile ? (
                  <PlayerProfileView
                    data={profile}
                    team={team}
                    t={t}
                    teeTimes={
                      programme && !teeTimesHeld
                        ? publicProfileTeeTimes(programme, profile.player.name)
                        : []
                    }
                  />
                ) : playerId ? (
                  <section className="pairings-empty" role="status" data-testid="profile-empty">
                    <h2>{t("programme.profileNotFoundTitle")}</h2>
                    <p>{t("programme.profileNotFoundBody")}</p>
                  </section>
                ) : programme && !programme.players.some((player) => player.id !== null) ? (
                  <div className="notice" role="status">
                    {t("programme.profileUnavailable")}
                  </div>
                ) : null}
              </>
            )
          ) : (
            <>
              {pairingsHeld ? (
                <HeldNotice testId="pairings-held" />
              ) : !pairings || !published ? (
                <section className="pairings-empty" role="status">
                  <h2>{t("pairings.notOutTitle")}</h2>
                  <p>{t("pairings.notOutBody")}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <a className="btn ghost no-print" href="/pairings">
                      {t("pairings.checkAgain")}
                    </a>
                    <Link className="btn ghost no-print" href="/">
                      {t("pairings.home")}
                    </Link>
                  </div>
                </section>
              ) : (
                <section
                  className="grid gap-3"
                  id="pairings"
                  style={{ scrollMarginTop: "calc(7rem + env(safe-area-inset-top, 0px))" }}
                >
                  {skippedRows > 0 && (
                    <p
                      className="notice warn no-print"
                      role="status"
                      data-testid="pairings-skipped"
                    >
                      Part of the published draw could not be read.{" "}
                      {skippedRows === 1 ? "1 row is" : `${skippedRows} rows are`} not shown.
                    </p>
                  )}
                  <PairingsView
                    pairings={pairings}
                    headingLevel="section"
                    flightFilter
                    you={you}
                    publicTimes
                  />
                </section>
              )}

              {rulesHeld ? (
                <HeldNotice compact testId="rules-held" />
              ) : programme?.rulesOfPlay ? (
                <RulesOfPlay text={programme.rulesOfPlay} />
              ) : null}
            </>
          )}
        </>
      )}

      <div className="pairings-foot no-print">
        <p className="pairings-foot-note">{t("pairings.footer")}</p>
        <nav className="pairings-foot-nav" aria-label={t("feedback.footerLabel")}>
          <Link href="/">{t("pairings.home")}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/roster">{t("programme.playersTitle")}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/rules?from=pairings">{t("programme.navFullRules")}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/leaderboard">{t("programme.navLeaderboard")}</Link>
        </nav>
      </div>
      <PublicBottomBar />
    </main>
  );
}
