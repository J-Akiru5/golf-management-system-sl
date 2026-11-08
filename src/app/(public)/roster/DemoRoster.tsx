"use client";

import { NeedsTournament } from "@/components/NeedsTournament";
import { RosterPage } from "@/components/public/RosterView";
import { toPublicProgramme, toPublicRoster } from "@/lib/data/public";
import { useDesk } from "@/lib/store/desk-store";
import { sampleProgramme } from "../pairings/DemoPairings";

/**
 * The roster in the no-database demo. It reads the same session programme the pairings demo uses,
 * so the names, flights and indexes agree with the sample draw. Without a selected event it shows
 * the standard empty state instead of inventing one.
 */
export function DemoRoster() {
  const { published, tournament, days, entries, registrations, players } = useDesk();

  if (!tournament) return <NeedsTournament what="The player roster" />;

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
