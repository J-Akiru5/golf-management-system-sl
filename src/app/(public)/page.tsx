import type { Metadata } from "next";
import {
  AboutSection,
  CapabilitySections,
  DemoCta,
  EventCarousel,
  LandingFooter,
  LandingHero,
  ProductShowcase,
  ProofStrip,
} from "@/components/landing";
import { PublicBottomBar } from "@/components/MobileTabBar";
import { LeaderboardTeaser } from "@/components/public/LeaderboardTeaser";
import { JsonLd } from "@/components/seo/JsonLd";
import { loadPublicTeamLeaderboard } from "@/lib/data/public-team-leaderboard";
import { loadShowcaseEvents } from "@/lib/data/supabase/public-events";
import { loadPublicReleaseState } from "@/lib/data/supabase/public-programme";
import { demoOpenEvents } from "@/lib/public/demo-events";
import type { PublicEvent } from "@/lib/public/highlights";
import {
  buildLeaderboardTeaser,
  type LeaderboardTeaser as LeaderboardTeaserData,
} from "@/lib/public/leaderboard-teaser";
import { PRODUCT_SHOTS, PROOF_SOURCE, PROOF_STATS } from "@/lib/public/platform-proof";
import {
  eventEyebrow,
  eventStatsFor,
  orderForCarousel,
  pickFeatured,
  quickActionsFor,
  toLandingEvent,
} from "@/lib/public/showcase";
import {
  openGraphFor,
  SITE_NAME,
  softwareApplicationSchema,
  sportsEventSchema,
  twitterFor,
} from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { APP_VERSION_LABEL } from "@/lib/version";

/**
 * Today, as the server sees it, in the club's timezone.
 *
 * Read once and passed down rather than looked up in a component: this page is server rendered and
 * then hydrated, so a countdown computed on both sides from `new Date()` would disagree across
 * midnight and React would report a mismatch.
 */
function todayInManila(): string {
  // en-CA gives YYYY-MM-DD, which is the form the database and the helpers both use.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/**
 * The events the landing page may show, or nothing.
 *
 * `null` from the loader means every read failed, which includes the migrations not being applied
 * yet. That is shown as no carousel rather than as the sample events: a live site inventing a
 * tournament is worse than a page with one section fewer.
 */
async function showcaseEvents(today: string): Promise<PublicEvent[]> {
  if (!isSupabaseConfigured()) return demoOpenEvents(today);
  try {
    return (await loadShowcaseEvents(createSupabasePublicClient(), today)) ?? [];
  } catch {
    return [];
  }
}

/**
 * The top of the public leaderboard, or nothing.
 *
 * It follows the leaderboard page: the section appears only when the desk has released the
 * leaderboard and the payload has at least one ranked team. A missing function, a held release or a
 * failed leaderboard read all render no section. A landing page that guesses a score is worse than
 * one with a section fewer.
 */
async function leaderboardTeaser(): Promise<LeaderboardTeaserData | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const client = createSupabasePublicClient();
    // The release state is asked first: while the desk is holding the results, the landing page
    // does not read a score at all.
    const release = await loadPublicReleaseState(client).catch(() => null);
    if (release?.leaderboard === false) return null;
    const board = await loadPublicTeamLeaderboard(client);
    if (!board) return null;
    return buildLeaderboardTeaser(board);
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: "Tournament software for golf clubs",
  description:
    "TeeLine Golf runs a club tournament from the first entry to the final score: entries, the draw, published pairings, live scorecards and results.",
  alternates: { canonical: "/" },
  openGraph: openGraphFor({
    title: `Tournament software for golf clubs | ${SITE_NAME}`,
    description:
      "Entries, the draw, published pairings, live scorecards and results for club tournaments.",
    path: "/",
  }),
  twitter: twitterFor({
    title: `Tournament software for golf clubs | ${SITE_NAME}`,
    description:
      "Entries, the draw, published pairings, live scorecards and results for club tournaments.",
  }),
};

export default async function HomePage() {
  const today = todayInManila();
  // Independent reads start together: the events and the leaderboard teaser do not wait on each
  // other.
  const [events, teaser] = await Promise.all([showcaseEvents(today), leaderboardTeaser()]);

  const landingEvents = orderForCarousel(events.map((event) => toLandingEvent(event, today)));
  const featured = pickFeatured(landingEvents);

  // Each published event as its own entity, so an engine can answer "when is it and where" without
  // reading the page design. Built from the event's own name and dates, nothing else.
  const eventSchemas = events
    .map((event) =>
      sportsEventSchema({ id: event.tournamentId, name: event.name, dates: event.dates }),
    )
    .filter((schema): schema is Record<string, unknown> => schema !== null);

  return (
    <main className="tl-landing">
      <JsonLd data={[softwareApplicationSchema(), ...eventSchemas]} />
      <LandingHero
        featured={featured}
        eventEyebrow={eventEyebrow(featured, today)}
        quickActions={quickActionsFor(featured)}
        eventStats={eventStatsFor(featured, today)}
        heroShot={PRODUCT_SHOTS[0] ?? null}
      />
      {/* The club's events come straight after the hero: that is where a visitor who came for a
          tournament looks first, and where the owner placed them. */}
      {landingEvents.length > 0 && <EventCarousel events={landingEvents} />}
      <ProductShowcase shots={PRODUCT_SHOTS} />
      <ProofStrip stats={PROOF_STATS} source={PROOF_SOURCE} />
      <CapabilitySections />
      {/* Standings belong to the day of play. Once the featured event has finished, "See all
          scores" opens the results, and the landing page shows no standings strip. */}
      {teaser && featured?.phase === "live" && <LeaderboardTeaser teaser={teaser} />}
      <AboutSection />
      <DemoCta />
      <LandingFooter versionLabel={APP_VERSION_LABEL} />
      <PublicBottomBar />
    </main>
  );
}
