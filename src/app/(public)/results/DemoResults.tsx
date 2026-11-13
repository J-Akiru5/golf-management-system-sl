"use client";

import { HeldNotice } from "@/components/public/HeldNotice";
import { LeaderboardShell } from "@/components/public/LeaderboardShell";
import { ScoresView } from "@/components/public/ScoresView";
import { sampleTeamLeaderboardData } from "@/lib/demo/public-leaderboard";
import { useDemoReleaseState } from "@/lib/demo/public-release";
import type { ScoreSession } from "@/lib/public/public-scores";

const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" });

/**
 * The All scores board in the no-database preview. The sample pairs alternate morning and afternoon
 * so the day and session controls have something honest to filter; every name and score is
 * fictional.
 */
export function DemoResults() {
  const release = useDemoReleaseState("bamboo-tee-2026");
  const data = sampleTeamLeaderboardData();
  const sessions: Record<string, ScoreSession> = {};
  for (const row of data.rows) {
    sessions[`${row.playerId}|${row.playDate}`] = (row.pairNumber ?? 1) % 2 === 1 ? "AM" : "PM";
  }
  const dateText = data.rounds.map((round) => dateLabel(round.playDate)).join(" · ");

  return (
    <LeaderboardShell active="scores" eventName={data.eventName} dateText={dateText}>
      {release.leaderboard === false ? (
        <HeldNotice testId="demo-scores-held" />
      ) : (
        <ScoresView data={data} sessions={sessions} />
      )}
    </LeaderboardShell>
  );
}
