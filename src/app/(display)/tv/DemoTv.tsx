import { TvBoardView } from "@/components/tv/TvBoard";
import { sampleTeamLeaderboardData } from "@/lib/demo/public-leaderboard";
import type { ScoreSession } from "@/lib/public/public-scores";
import { type ScoreStart, scoreSessionKey } from "@/lib/public/score-sessions";
import { buildTvBoard, manilaDateIso } from "@/lib/public/tv-board";

const clock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The board in the no-database preview. The sample pairs alternate morning and afternoon, and each
 * pair gets a plausible tee time, so the two columns and the tee line have something to show; every
 * name, time and score is fictional.
 */
export function DemoTv() {
  const data = sampleTeamLeaderboardData();
  const sessions: Record<string, ScoreSession> = {};
  const starts: Record<string, ScoreStart> = {};

  for (const row of data.rows) {
    const pair = row.pairNumber ?? 1;
    const morning = pair % 2 === 1;
    sessions[scoreSessionKey(row.playerId, row.playDate)] = morning ? "AM" : "PM";
    starts[scoreSessionKey(row.playerId, row.playDate)] = {
      time: clock((morning ? 6 * 60 + 30 : 12 * 60 + 30) + (pair % 7) * 10),
      hole: 1 + (pair % 18),
    };
  }

  return <TvBoardView board={buildTvBoard(data, sessions, manilaDateIso(), starts)} />;
}
