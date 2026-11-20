import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AwardingPodium } from "@/components/public/AwardingPodium";
import { LeaderboardShell } from "@/components/public/LeaderboardShell";
import { buildTeamLeaderboard } from "@/lib/data/public-team-leaderboard";
import {
  readPublicReleaseState,
  readPublicRevealState,
  readPublicTeamLeaderboard,
} from "@/lib/data/supabase/public-cache";
import { demoLaneReveal } from "@/lib/demo/awarding";
import { getI18n } from "@/lib/i18n/server";
import { buildAwardingBoards } from "@/lib/public/awarding";
import { awardingDemoOn } from "@/lib/public/awarding-demo";
import { type LaneRevealMap, REVEAL_LANES } from "@/lib/public/results-reveal";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Awarding results",
  description:
    "The class champions and the net and gross overall winners, released by the club category by category as the awarding is called.",
  alternates: { canonical: "/results" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Every lane held with no board: what the page shows before the club releases anything. */
function allHeld(): LaneRevealMap {
  const held = {} as LaneRevealMap;
  for (const lane of REVEAL_LANES) {
    held[lane.id] = { state: "held", releaseAt: null, board: [] };
  }
  return held;
}

/** Every lane released with its board: the degradation when the lane reader is not applied. */
function allReleasedBoards(teams: ReturnType<typeof buildTeamLeaderboard>["teams"]): LaneRevealMap {
  const boards = buildAwardingBoards(teams);
  return {
    classA: { state: "released", releaseAt: null, board: boards.classA },
    classB: { state: "released", releaseAt: null, board: boards.classB },
    classC: { state: "released", releaseAt: null, board: boards.classC },
    classD: { state: "released", releaseAt: null, board: boards.classD },
    netOverall: { state: "released", releaseAt: null, board: boards.netOverall },
    grossOverall: { state: "released", releaseAt: null, board: boards.grossOverall },
  };
}

/**
 * The public awarding page: six boards, released one at a time by the desk.
 *
 * Where the boards come from, in order of what the deployment can do:
 *
 * 1. **Demo (staging only).** `AWARDING_DEMO=1` serves the demo build's fixed sample boards on a
 *    three-minute loop, so the blank board, the countdown and the flash can be rehearsed on a phone
 *    without a database and without a real result. The flag is refused on a production deployment
 *    (see `awarding-demo.ts`), so this path cannot reach the live event.
 * 2. **Lane state from the database.** `public_reveal_state()` returns each lane's state and, for a
 *    released lane only, the top three the desk confirmed. A held lane arrives with no name and no
 *    score, so nothing is in the HTML or in the response to read around the page.
 * 3. **The existing release gate.** On a deployment that has not applied the awarding migration the
 *    function answers nothing, and the page falls back to the leaderboard release key the desk
 *    already controls: held means all six boards blank, released means all six show. That is the
 *    documented degradation, and it is still a database gate, never a hidden element.
 */
export default async function AwardingResultsPage() {
  const { t } = await getI18n();
  const serverNow = new Date().toISOString();

  if (awardingDemoOn()) {
    return (
      <PodiumShell title={t("awarding.title")} subtitle={t("awarding.subtitle")}>
        <AwardingPodium lanes={demoLaneReveal(Date.now())} serverNow={serverNow} demo />
      </PodiumShell>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <PodiumShell title={t("awarding.title")} subtitle={t("awarding.subtitle")}>
        <AwardingPodium lanes={allHeld()} serverNow={serverNow} />
      </PodiumShell>
    );
  }

  // The release state is the safety net and the lane read is the real gate. Both are read first;
  // no score is fetched while the lanes are held.
  const [revealResult, releaseResult] = await Promise.allSettled([
    readPublicRevealState(),
    readPublicReleaseState(),
  ]);
  const reveal = revealResult.status === "fulfilled" ? revealResult.value : null;
  const release = releaseResult.status === "fulfilled" ? releaseResult.value : null;

  let lanes: LaneRevealMap;
  if (reveal) {
    lanes = reveal.lanes;
  } else if (release?.leaderboard === false) {
    // No lane reader, and the desk is holding the leaderboard: every board blank.
    lanes = allHeld();
  } else {
    // No lane reader and the results are released: the page shows every board once, which is the
    // pre-lane behaviour the club already knows.
    try {
      const data = await readPublicTeamLeaderboard();
      lanes = data ? allReleasedBoards(buildTeamLeaderboard(data).teams) : allHeld();
    } catch {
      lanes = allHeld();
    }
  }

  return (
    <PodiumShell title={t("awarding.title")} subtitle={t("awarding.subtitle")}>
      <AwardingPodium lanes={lanes} serverNow={serverNow} />
    </PodiumShell>
  );
}

/** The public results frame: the same head and footer as the board, with the awarding in the body. */
function PodiumShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <LeaderboardShell eventName={title} dateText={subtitle} active="scores">
      {children}
    </LeaderboardShell>
  );
}
