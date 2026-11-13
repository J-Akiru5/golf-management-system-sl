import type { Metadata } from "next";
import Link from "next/link";
import { HeldNotice } from "@/components/public/HeldNotice";
import { LeaderboardShell } from "@/components/public/LeaderboardShell";
import { ScoresView } from "@/components/public/ScoresView";
import { applyLiveClasses, liveClassesFromProgramme } from "@/lib/data/public-team-leaderboard";
import {
  readPublicAdvisory,
  readPublicPairings,
  readPublicProgramme,
  readPublicReleaseState,
  readPublicTeamLeaderboard,
} from "@/lib/data/supabase/public-cache";
import { getI18n } from "@/lib/i18n/server";
import { advisoryForToday } from "@/lib/public/advisory";
import { buildScoreSessions } from "@/lib/public/score-sessions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoResults } from "./DemoResults";

export const metadata: Metadata = { title: "All scores" };
export const dynamic = "force-dynamic";

const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" });

/**
 * The public "All scores" board: every player with a published card, not only the ten teams the
 * board lists. It reads the same frozen publication as the leaderboard, so nothing here can show a
 * score the desk has not published, and it takes the morning/afternoon split from the published
 * pairings rather than adding a database read of its own.
 */
export default async function ResultsPage() {
  const { t } = await getI18n();

  if (!isSupabaseConfigured()) {
    return <DemoResults />;
  }

  // Every read is independent and cached, so they start together.
  const [leaderboardResult, releaseResult, pairingsResult, programmeResult, advisoryResult] =
    await Promise.allSettled([
      readPublicTeamLeaderboard(),
      readPublicReleaseState(),
      readPublicPairings(),
      readPublicProgramme(),
      readPublicAdvisory(),
    ]);

  const data = leaderboardResult.status === "fulfilled" ? leaderboardResult.value : null;
  const failure =
    leaderboardResult.status === "rejected"
      ? leaderboardResult.reason instanceof Error
        ? leaderboardResult.reason.message
        : t("programme.leaderboardFailed")
      : "";
  const release = releaseResult.status === "fulfilled" ? releaseResult.value : null;
  const pairings = pairingsResult.status === "fulfilled" ? pairingsResult.value : null;
  const programme = programmeResult.status === "fulfilled" ? programmeResult.value : null;
  const advisory = advisoryForToday(
    advisoryResult.status === "fulfilled" ? advisoryResult.value : null,
  );

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
    if (release?.leaderboard === false) {
      return (
        <LeaderboardShell active="scores" advisory={advisory}>
          <HeldNotice testId="scores-held" />
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
      <nav className="site-foot-nav no-print" aria-label="Footer">
        <Link href="/leaderboard">{t("programme.navLeaderboard")}</Link>
        <span aria-hidden="true">·</span>
        <Link href="/pairings">{t("programme.navPairings")}</Link>
        <span aria-hidden="true">·</span>
        <Link href="/roster">{t("programme.navPlayers")}</Link>
      </nav>
    </LeaderboardShell>
  );
}
