import type { Metadata } from "next";
import { TvBoardView, TvIdle } from "@/components/tv/TvBoard";
import { applyLiveClasses, liveClassesFromProgramme } from "@/lib/data/public-team-leaderboard";
import {
  readPublicPairings,
  readPublicProgramme,
  readPublicReleaseState,
  readPublicTeamLeaderboard,
} from "@/lib/data/supabase/public-cache";
import { buildScoreSessions, buildScoreStarts } from "@/lib/public/score-sessions";
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
 */
export default async function TvPage() {
  if (!isSupabaseConfigured()) {
    return <DemoTv />;
  }

  const [leaderboardResult, pairingsResult, programmeResult, releaseResult] =
    await Promise.allSettled([
      readPublicTeamLeaderboard(),
      readPublicPairings(),
      readPublicProgramme(),
      readPublicReleaseState(),
    ]);

  const data = leaderboardResult.status === "fulfilled" ? leaderboardResult.value : null;
  const pairings = pairingsResult.status === "fulfilled" ? pairingsResult.value : null;
  const programme = programmeResult.status === "fulfilled" ? programmeResult.value : null;
  const release = releaseResult.status === "fulfilled" ? releaseResult.value : null;

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

  if (release?.leaderboard === false) {
    return (
      <TvIdle
        eventName={data?.eventName ?? null}
        note="The desk is preparing the board. Scores appear here once they are released."
      />
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
