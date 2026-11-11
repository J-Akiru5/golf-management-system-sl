import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { PairingsView, type PairingsYou } from "@/components/PairingsView";
import { PlayerOfflineNotice } from "@/components/player/OfflinePortal";
import { HeldNotice } from "@/components/public/HeldNotice";
import { PairingsLive } from "@/components/public/PairingsLive";
import { PlayerProfileSearch } from "@/components/public/PlayerProfileSearch";
import { PlayerProfileView } from "@/components/public/PlayerProfileView";
import { RulesOfPlay, TeeTimesBoard } from "@/components/public/ProgrammeView";
import { PublicAdvisoryBanner } from "@/components/public/PublicAdvisoryBanner";
import { PublicBackLink } from "@/components/public/PublicBackLink";
import { PublicTournamentNav } from "@/components/public/PublicTournamentNav";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fmtDateLabel, fmtRange } from "@/lib/data/labels";
import { type PublicReleaseState, toPublicPairings } from "@/lib/data/public";
import {
  loadPublicPlayerProfile,
  type PublicPlayerProfileData,
  profileTeeTimes,
} from "@/lib/data/public-profile";
import { parsePublicTab } from "@/lib/data/public-tabs";
import {
  buildTeamLeaderboard,
  loadPublicTeamLeaderboard,
  type PublicTeamStanding,
} from "@/lib/data/public-team-leaderboard";
import { loadPublicAdvisory } from "@/lib/data/supabase/public-advisory";
import { loadPublicPairings } from "@/lib/data/supabase/public-pairings";
import { loadPublicProgramme, loadPublicReleaseState } from "@/lib/data/supabase/public-programme";
import { fmtTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { loadPortal } from "@/lib/player/portal";
import { advisoryForToday, type PublicAdvisory } from "@/lib/public/advisory";
import { pairingsSignature } from "@/lib/public/pairings-live";
import { pairingsBackLink } from "@/lib/public/pairings-nav";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";
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
 * round) is worse than a database round trip at this club's size. The organizer's publish action
 * still refreshes whatever is cached around the pairings.
 *
 * The pairings come from the frozen published snapshot. The day schedule, the player cards and the
 * rules are reference data read through `public_programme()`, which only answers while the event is
 * published; a time that the desk has not confirmed is never part of that projection. The player
 * profile tab reads one player's frozen card through `public_player_scorecard()`; the leaderboard
 * lives on its own page because the team table adds every published round together.
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
  let data: Awaited<ReturnType<typeof loadPublicPairings>> = null;
  let programme: Awaited<ReturnType<typeof loadPublicProgramme>> = null;
  let release: PublicReleaseState | null = null;
  let advisoryValue: PublicAdvisory | null = null;
  let failed = false;
  // The programme, release and advisory reads are additive: a database that has not applied their
  // migrations still serves the pairings, because the failed read only costs the extra sections.
  const [pairingsResult, programmeResult, releaseResult, advisoryResult] = await Promise.allSettled(
    [
      loadPublicPairings(client),
      loadPublicProgramme(client),
      loadPublicReleaseState(client),
      loadPublicAdvisory(client),
    ],
  );
  if (pairingsResult.status === "fulfilled") data = pairingsResult.value;
  else failed = true;
  if (programmeResult.status === "fulfilled") programme = programmeResult.value;
  if (releaseResult.status === "fulfilled") release = releaseResult.value;
  if (advisoryResult.status === "fulfilled") advisoryValue = advisoryResult.value;

  let profile: PublicPlayerProfileData | null = null;
  let team: PublicTeamStanding | null = null;
  let profileFailed = false;
  if (tab === "profile" && playerId) {
    try {
      profile = await loadPublicPlayerProfile(client, playerId);
    } catch {
      profileFailed = true;
    }
    if (profile) {
      const profilePlayerId = profile.player.id;
      try {
        const leaderboard = await loadPublicTeamLeaderboard(client);
        if (leaderboard) {
          team =
            buildTeamLeaderboard(leaderboard).teams.find((entry) =>
              entry.playerIds.includes(profilePlayerId),
            ) ?? null;
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
      <PlayerOfflineNotice path="/pairings" />
      <PairingsLive signature={liveSignature} />
      <header className="public-head public-appbar !p-4 sm:!p-5">
        {/* Inside a player's profile the way back is the pairings list; everywhere else it is the
            main page. */}
        <PublicBackLink label={t(back.labelKey)} href={back.href} />
        <div className="public-appbar-row flex flex-wrap items-start justify-between gap-3">
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
          <div className="public-appbar-controls flex items-center gap-2">
            <ThemeToggle compact tone="nav" />
            <LanguageSwitcher tone="on-forest" />
            <HelpButton audience="player" screen="pairings" />
          </div>
        </div>
        {data ? (
          <>
            <p className="public-appbar-kicker overline mt-2 !text-gold-on-forest">
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
              <HeldNotice
                testId={rosterHeld ? "profile-roster-held" : "profile-leaderboard-held"}
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
                        ? profileTeeTimes(programme, profile.player.name)
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
                    <p
                      className="notice warn no-print"
                      role="status"
                      data-testid="pairings-skipped"
                    >
                      Part of the published draw could not be read.{" "}
                      {skippedRows === 1 ? "1 row is" : `${skippedRows} rows are`} not shown.
                    </p>
                  )}
                  <PairingsView pairings={pairings} headingLevel="section" flightFilter you={you} />
                </section>
              )}

              {teeTimesHeld ? (
                <HeldNotice compact testId="tee-times-held" />
              ) : programme ? (
                <TeeTimesBoard programme={programme} />
              ) : null}

              {rulesHeld ? (
                <HeldNotice compact testId="rules-held" />
              ) : programme?.rulesOfPlay ? (
                <RulesOfPlay text={programme.rulesOfPlay} />
              ) : null}
            </>
          )}
        </>
      )}

      <p className="hint no-print">
        {t("pairings.footer")}{" "}
        <Link href="/" className="inline-flex min-h-11 items-center">
          {t("pairings.home")}
        </Link>{" "}
        ·{" "}
        <Link href="/roster" className="inline-flex min-h-11 items-center">
          {t("programme.playersTitle")}
        </Link>{" "}
        ·{" "}
        <Link href="/rules?from=pairings" className="inline-flex min-h-11 items-center">
          {t("programme.navFullRules")}
        </Link>{" "}
        ·{" "}
        <Link href="/leaderboard" className="inline-flex min-h-11 items-center">
          {t("programme.navLeaderboard")}
        </Link>
        {tab === "pairings" && programme?.rulesOfPlay && (
          <>
            {" · "}
            <a href="#rules" className="inline-flex min-h-11 items-center">
              {t("programme.navRules")}
            </a>
          </>
        )}
      </p>
      <PlayerBottomBar />
    </main>
  );
}
