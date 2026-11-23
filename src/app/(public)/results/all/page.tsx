import type { Metadata } from "next";
import { LeaderboardShell } from "@/components/public/LeaderboardShell";
import { PublicLive } from "@/components/public/PublicLive";
import { ResultsHolding } from "@/components/public/ResultsHolding";
import { ScoresView } from "@/components/public/ScoresView";
import { applyLiveClasses, liveClassesFromProgramme } from "@/lib/data/public-team-leaderboard";
import {
  readPublicAdvisory,
  readPublicLiveSignature,
  readPublicPairings,
  readPublicProgramme,
  readPublicReleaseState,
  readPublicRevealState,
  readPublicTeamLeaderboard,
} from "@/lib/data/supabase/public-cache";
import { getI18n } from "@/lib/i18n/server";
import { advisoryForToday } from "@/lib/public/advisory";
import { blackoutFlags } from "@/lib/public/results-reveal";
import { buildScoreSessions } from "@/lib/public/score-sessions";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoResults } from "./DemoResults";

const ALL_SCORES_DESCRIPTION =
  "Every player with a published card, morning and afternoon, on one board: gross and net points for each published round of the tournament.";

export const metadata: Metadata = {
  title: "All scores",
  description: ALL_SCORES_DESCRIPTION,
  alternates: { canonical: "/results/all" },
  openGraph: openGraphFor({
    title: `All scores | ${SITE_NAME}`,
    description: ALL_SCORES_DESCRIPTION,
    path: "/results/all",
  }),
  twitter: twitterFor({ title: `All scores | ${SITE_NAME}`, description: ALL_SCORES_DESCRIPTION }),
};
export const dynamic = "force-dynamic";

const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" });

/**
 * The public "All scores" board: every player with a published card, not only the ten teams the
 * board lists. It reads the same frozen publication as the leaderboard, so nothing here can show a
 * score the desk has not published, and it takes the morning/afternoon split from the published
 * pairings rather than adding a database read of its own.
 *
 * The live signature is read once for the page and handed to `PublicLive`, so a round the desk
 * publishes reaches an open phone within one poll without a reload.
 */
export default async function ResultsPage() {
  if (!isSupabaseConfigured()) {
    return <DemoResults />;
  }
  const live = await readPublicLiveSignature();
  return (
    <>
      <PublicLive signature={live} />
      <ResultsBoard />
    </>
  );
}

/** The board itself, split out so it renders below the live refresher on every path. */
async function ResultsBoard() {
  const { t } = await getI18n();

  // The release state and the programme come first, on their own. A held results surface means
  // this page asks for no score at all; the holding screen is rendered from the release alone.
  const [releaseResult, programmeResult, advisoryResult] = await Promise.allSettled([
    readPublicReleaseState(),
    readPublicProgramme(),
    readPublicAdvisory(),
  ]);
  const release = releaseResult.status === "fulfilled" ? releaseResult.value : null;
  const programme = programmeResult.status === "fulfilled" ? programmeResult.value : null;
  const advisory = advisoryForToday(
    advisoryResult.status === "fulfilled" ? advisoryResult.value : null,
  );

  if (release?.leaderboard === false && programme) {
    const reveal = await readPublicRevealState().catch(() => null);
    return (
      <LeaderboardShell active="scores" advisory={advisory}>
        <ResultsHolding
          revealAt={reveal?.revealAt ?? null}
          serverNow={new Date().toISOString()}
          held={blackoutFlags(release)}
        />
      </LeaderboardShell>
    );
  }

  // The pairings give the morning/afternoon split, not a score, so they are read on their own.
  const pairingsResult = await Promise.allSettled([readPublicPairings()]);
  const pairings = pairingsResult[0].status === "fulfilled" ? pairingsResult[0].value : null;

  let data: Awaited<ReturnType<typeof readPublicTeamLeaderboard>> = null;
  let failure = "";
  try {
    data = await readPublicTeamLeaderboard();
  } catch (error) {
    failure = error instanceof Error ? error.message : t("programme.leaderboardFailed");
  }

  if (!data && !failure) {
    if (!programme) {
      return (
        <LeaderboardShell active="scores" advisory={advisory}>
          <section className="pairings-empty" role="status" data-testid="scores-unpublished">
            <h2>{t("pairings.notOutTitle")}</h2>
            <p>{t("pairings.notOutBody")}</p>
          </section>
        </LeaderboardShell>
      );
    }
    return (
      <LeaderboardShell active="scores" advisory={advisory}>
        <div className="notice" role="status" data-testid="scores-unavailable">
          {t("programme.scoresUnavailable")}
        </div>
      </LeaderboardShell>
    );
  }

  if (failure || !data) {
    return (
      <LeaderboardShell active="scores" advisory={advisory}>
        <div className="notice" role="alert">
          {failure || t("programme.leaderboardFailed")}
        </div>
      </LeaderboardShell>
    );
  }

  const sessions = buildScoreSessions(pairings?.published?.groups ?? []);
  const rows = applyLiveClasses(data, liveClassesFromProgramme(programme)).rows;

  return (
    <LeaderboardShell
      active="scores"
      eventName={data.eventName}
      dateText={data.rounds.map((round) => dateLabel(round.playDate)).join(" · ")}
      advisory={advisory}
    >
      {data.rounds.length === 0 ? (
        <section className="pairings-empty" role="status" data-testid="scores-empty">
          <h2>{t("programme.scoresEmptyTitle")}</h2>
          <p>{t("programme.scoresEmptyBody")}</p>
        </section>
      ) : rows.length === 0 ? (
        <div className="notice" role="status" data-testid="scores-no-cards">
          {t("programme.leaderboardNoCards")}
        </div>
      ) : (
        <ScoresView data={{ ...data, rows }} sessions={sessions} />
      )}
    </LeaderboardShell>
  );
}
