import type { Metadata } from "next";
import { TvBoardView, TvIdle } from "@/components/tv/TvBoard";
import { TvHoldingView } from "@/components/tv/TvHolding";
import { applyLiveClasses, liveClassesFromProgramme } from "@/lib/data/public-team-leaderboard";
import {
  readPublicPairings,
  readPublicProgramme,
  readPublicReleaseState,
  readPublicRevealState,
  readPublicTeamLeaderboard,
} from "@/lib/data/supabase/public-cache";
import { buildScoreSessions, buildScoreStarts } from "@/lib/public/score-sessions";
import { blackoutFlags } from "@/lib/public/results-reveal";
import { buildTvBoard, manilaDateIso } from "@/lib/public/tv-board";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoTv } from "./DemoTv";

export const metadata: Metadata = {
  title: "Clubhouse board",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The clubhouse TV board.
 *
 * The same frozen publication the leaderboard and the all-scores page read, laid out for a screen on
 * the wall: today's morning and afternoon fields, ranked, with gross and net Stableford points. It
 * adds no database read of its own; the morning and afternoon split comes from the published
 * pairings by the same rule the pairings page prints.
 *
 * While the desk is holding the results, the board reads the release state first and shows the
 * holding screen with the countdown: no score is fetched and nothing is on the wall to be seen from
 * the bar.
 */
export default async function TvPage() {
  if (!isSupabaseConfigured()) {
    return <DemoTv />;
  }

  const [releaseResult, revealResult] = await Promise.allSettled([
    readPublicReleaseState(),
    readPublicRevealState(),
  ]);
  const release = releaseResult.status === "fulfilled" ? releaseResult.value : null;

  if (release?.leaderboard === false || release?.roster === false) {
    const reveal = revealResult.status === "fulfilled" ? revealResult.value : null;
    return (
      <TvHoldingView
        eventName={null}
        revealAt={reveal?.revealAt ?? null}
        serverNow={new Date().toISOString()}
        held={blackoutFlags(release)}
      />
    );
  }

  const [leaderboardResult, pairingsResult, programmeResult] = await Promise.allSettled([
    readPublicTeamLeaderboard(),
    readPublicPairings(),
    readPublicProgramme(),
  ]);

  const data = leaderboardResult.status === "fulfilled" ? leaderboardResult.value : null;
  const pairings = pairingsResult.status === "fulfilled" ? pairingsResult.value : null;
  const programme = programmeResult.status === "fulfilled" ? programmeResult.value : null;

  if (leaderboardResult.status === "rejected") {
    return (
      <TvIdle eventName={null} note="The scores could not be read just now. Retrying shortly." />
    );
  }

  if (!programme) {
    return (
      <TvIdle eventName={data?.eventName ?? null} note="This event has not been published yet." />
    );
  }

  if (!data) {
    return (
      <TvIdle eventName={null} note="The scores could not be read just now. Retrying shortly." />
    );
  }

  const groups = pairings?.published?.groups ?? [];
  const sessions = buildScoreSessions(groups);
  const starts = buildScoreStarts(groups);
  const withLiveClasses = applyLiveClasses(data, liveClassesFromProgramme(programme));
  const board = buildTvBoard(withLiveClasses, sessions, manilaDateIso(), starts);

  return <TvBoardView board={board} />;
}
