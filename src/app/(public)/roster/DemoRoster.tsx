"use client";

import { NeedsTournament } from "@/components/NeedsTournament";
import { ResultsHolding } from "@/components/public/ResultsHolding";
import { RosterPage } from "@/components/public/RosterView";
import { toPublicProgramme, toPublicRoster } from "@/lib/data/public";
import { useDemoReleaseState } from "@/lib/demo/public-release";
import { blackoutFlags } from "@/lib/public/results-reveal";
import { useDesk } from "@/lib/store/desk-store";
import { sampleProgramme } from "../pairings/DemoPairings";

/**
 * The roster in the no-database demo. It reads the same session programme the pairings demo uses,
 * so the names, flights and indexes agree with the sample draw. Without a selected event it shows
 * the standard empty state instead of inventing one.
 */
export function DemoRoster() {
  const { published, tournament, days, entries, registrations, players } = useDesk();
  const release = useDemoReleaseState(tournament?.id ?? "bamboo-tee-2026");

  if (!tournament) return <NeedsTournament what="The player roster" />;

  if (release.roster === false) {
    return (
      <RosterPage
        players={[]}
        unavailable="held"
        holding={
          <ResultsHolding
            revealAt={release.revealAt}
            serverNow={null}
            held={blackoutFlags(release)}
          />
        }
      />
    );
  }

  const programme = published
    ? toPublicProgramme({
        days,
        entries,
        registrations,
        players,
        categories: tournament.categories,
        flights: tournament.flights,
        rulesOfPlay: tournament.rulesOfPlay,
      })
    : sampleProgramme();

  return <RosterPage players={toPublicRoster(programme).players} />;
}
