"use client";

import { HeldNotice } from "@/components/public/HeldNotice";
import { LeaderboardShell } from "@/components/public/LeaderboardShell";
import { TeamLeaderboard } from "@/components/public/TeamLeaderboard";
import {
  buildTeamLeaderboard,
  filterTeams,
  rankTeams,
  teamOptions,
  topTeams,
} from "@/lib/data/public-team-leaderboard";
import { sampleTeamLeaderboardData } from "@/lib/demo/public-leaderboard";
import { useDemoReleaseState } from "@/lib/demo/public-release";

const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" });

/** The sample leaderboard in the no-database preview, including the leaderboard hold. */
export function DemoLeaderboard({ filters }: { filters: { category: string; flight: string } }) {
  const release = useDemoReleaseState("bamboo-tee-2026");
  const data = sampleTeamLeaderboardData();
  const { teams, unpaired } = buildTeamLeaderboard(data);
  const dateText = data.rounds.map((round) => dateLabel(round.playDate)).join(" · ");

  return (
    <LeaderboardShell eventName={data.eventName} dateText={dateText}>
      {release.leaderboard === false ? (
        <HeldNotice testId="demo-leaderboard-held" />
      ) : (
        <TeamLeaderboard
          teams={topTeams(rankTeams(filterTeams(teams, filters)), 10)}
          options={teamOptions(data)}
          filters={filters}
          rounds={data.rounds}
          tieBreak={data.tieBreak}
          unpaired={unpaired}
          eventName={data.eventName}
        />
      )}
    </LeaderboardShell>
  );
}
