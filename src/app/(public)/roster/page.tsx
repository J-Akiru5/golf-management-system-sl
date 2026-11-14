import type { Metadata } from "next";
import { RosterPage, type RosterUnavailable } from "@/components/public/RosterView";
import { ResultsHolding } from "@/components/public/ResultsHolding";
import { toPublicRoster } from "@/lib/data/public";
import {
  readPublicAdvisory,
  readPublicProgramme,
  readPublicReleaseState,
  readPublicRevealState,
} from "@/lib/data/supabase/public-cache";
import type { PublicRosterPlayer } from "@/lib/data/types";
import { advisoryForToday, type PublicAdvisory } from "@/lib/public/advisory";
import { blackoutFlags } from "@/lib/public/results-reveal";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DemoRoster } from "./DemoRoster";

export const metadata: Metadata = {
  title: "Player roster",
  description:
    "The confirmed tournament field: name, home club, handicap index, category and flight. No account needed.",
  alternates: { canonical: "/roster" },
  openGraph: openGraphFor({
    title: `Player roster | ${SITE_NAME}`,
    description:
      "The confirmed tournament field: name, home club, handicap index, category and flight.",
    path: "/roster",
  }),
  twitter: twitterFor({
    title: `Player roster | ${SITE_NAME}`,
    description:
      "The confirmed tournament field: name, home club, handicap index, category and flight.",
  }),
};

export const dynamic = "force-dynamic";

/**
 * The public roster. It reads the same `public_programme()` projection as `/pairings` and then
 * reduces it on the server to the five roster fields, so an unauthenticated browser never receives
 * the day schedule, tee times, holes, groups, pairings, rules or any private player field.
 *
 * The database function returns null while the event is unpublished, which renders the empty state
 * with no roster content. A failed read renders the retry state and still shows no roster content.
 */
export default async function PublicRosterPage() {
  if (!isSupabaseConfigured()) return <DemoRoster />;

  // The release state is read first, on its own. While the player list is held, the roster asks
  // the programme for nothing at all: no name, index, club or flight is fetched.
  const [releaseResult, advisoryResult] = await Promise.allSettled([
    readPublicReleaseState(),
    readPublicAdvisory(),
  ]);
  const release = releaseResult.status === "fulfilled" ? releaseResult.value : null;
  const advisory =
    advisoryResult.status === "fulfilled"
      ? advisoryForToday(advisoryResult.value)
      : advisoryForToday(null);

  if (release?.roster === false) {
    const reveal = await readPublicRevealState().catch(() => null);
    return (
      <RosterPage
        players={[]}
        unavailable="held"
        advisory={advisory}
        holding={
          <ResultsHolding
            revealAt={reveal?.revealAt ?? null}
            serverNow={new Date().toISOString()}
            held={blackoutFlags(release)}
          />
        }
      />
    );
  }

  let players: PublicRosterPlayer[] = [];
  let unavailable: RosterUnavailable = "none";
  let advisoryValue: PublicAdvisory | null = null;

  try {
    const [programmeResult, advisoryResult] = await Promise.allSettled([
      readPublicProgramme(),
      readPublicAdvisory(),
    ]);
    if (programmeResult.status === "rejected") {
      unavailable = "failed";
    } else if (!programmeResult.value) {
      unavailable = "unpublished";
    } else {
      players = toPublicRoster(programmeResult.value).players;
    }
    if (advisoryResult.status === "fulfilled") advisoryValue = advisoryResult.value;
  } catch {
    unavailable = "failed";
  }

  return (
    <RosterPage
      players={players}
      unavailable={unavailable}
      advisory={advisoryForToday(advisoryValue)}
    />
  );
}
