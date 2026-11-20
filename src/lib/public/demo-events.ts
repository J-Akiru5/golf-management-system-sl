import { makeDemoSeed, makeDemoTournaments } from "@/lib/demo/data";
import type { PublicEvent } from "./highlights";

/**
 * The sample events, in the shape the carousel wants, for a build with no database.
 *
 * Filtered by the same rule the database uses: open, and the cut-off has not passed. Keeping the rule
 * in step matters because the demo is what a reviewer sees, and an event that shows here but not on a
 * connected build would read as a bug in the connected build.
 *
 * `entered` counts the seed's entries. On a connected build it counts confirmed entries only, because
 * a submission lands as `needs_review` until the desk accepts it. Eligibility is derived here rather
 * than stored, so the sample figure is the entry list, and it is illustrative.
 */
export function demoOpenEvents(today: string): PublicEvent[] {
  const { entries } = makeDemoSeed();

  return makeDemoTournaments()
    .filter((t) => t.state === "open" && t.cutOffDate >= today)
    .map((t, index) => ({
      tournamentId: t.id,
      name: t.name,
      dates: t.dates,
      startFormat: t.config.startFormat,
      firstTeeTime: t.config.firstTeeTime,
      cutOffDate: t.cutOffDate,
      entered: entries.filter((e) => e.tournamentId === t.id).length,
      entriesOpen: true,
      // The demo has no desk setting to read, so the first listed event is the featured one. That
      // matches the live page without a database: one featured event when there is a listed event,
      // none when the filter above leaves nothing.
      featured: index === 0,
    }));
}
