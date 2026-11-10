import type { Metadata } from "next";
import { RosterPage, type RosterUnavailable } from "@/components/public/RosterView";
import { toPublicRoster } from "@/lib/data/public";
import { loadPublicProgramme, loadPublicReleaseState } from "@/lib/data/supabase/public-programme";
import type { PublicRosterPlayer } from "@/lib/data/types";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
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

  const client = createSupabasePublicClient();
  let players: PublicRosterPlayer[] = [];
  let unavailable: RosterUnavailable = "none";

  try {
    const [programmeResult, releaseResult] = await Promise.allSettled([
      loadPublicProgramme(client),
      loadPublicReleaseState(client),
    ]);
    if (programmeResult.status === "rejected") {
      unavailable = "failed";
    } else if (!programmeResult.value) {
      unavailable = "unpublished";
    } else if (releaseResult.status === "fulfilled" && releaseResult.value?.roster === false) {
      unavailable = "held";
    } else {
      players = toPublicRoster(programmeResult.value).players;
    }
  } catch {
    unavailable = "failed";
  }

  return <RosterPage players={players} unavailable={unavailable} />;
}
