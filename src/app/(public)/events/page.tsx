import type { Metadata } from "next";
import Link from "next/link";
import {
  ARCHIVE_PHASE_LABELS,
  type ArchivedEvent,
  loadEventArchive,
} from "@/lib/data/supabase/event-archive";
import { dateRange, enteredLabel, VENUE_LABEL } from "@/lib/public/highlights";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { todayInManila } from "./_lib/today";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Every tournament the club has run or will run, newest first, with its dates, its venue and a page for each one.",
  alternates: { canonical: "/events" },
  openGraph: openGraphFor({
    title: `Events | ${SITE_NAME}`,
    description:
      "The club's tournaments, newest first: dates, venue and a page for each event's pairings, results and rules.",
    path: "/events",
  }),
  twitter: twitterFor({
    title: `Events | ${SITE_NAME}`,
    description: "The club's tournaments, newest first, each with its own page.",
  }),
};

/**
 * The events portfolio.
 *
 * It lists only what `public_event_archive()` returns: events the club has announced, in state open
 * or closed. A project that has not applied that migration falls back to the showcase and then the
 * older public read, so the page works either way. With no events it says so plainly; it never falls
 * back to sample events, because inventing a tournament on the club's public site is worse than an
 * empty page.
 */
export default async function EventsPage() {
  const today = todayInManila();
  let events: ArchivedEvent[] = [];
  let failed = false;

  if (isSupabaseConfigured()) {
    try {
      events = (await loadEventArchive(createSupabasePublicClient(), today)) ?? [];
    } catch {
      failed = true;
    }
  }

  return (
    <div className="tl-pub-page">
      <header className="tl-pub-section">
        <p className="tl-pub-kicker">The club&rsquo;s tournaments</p>
        <h1 className="tl-pub-title">Events</h1>
        <p>
          Every tournament the club has run or will run, newest first. Open an event for its
          pairings, its results and the organizer&rsquo;s rules of play.
        </p>
      </header>

      <section className="tl-pub-section" aria-labelledby="events-list-title">
        <h2 id="events-list-title" className="tl-pub-title">
          {events.length > 0 ? `${events.length} events` : "The list"}
        </h2>

        {failed ? (
          <p className="tl-pub-card" role="status">
            The event list could not be read just now. Reload the page in a moment.
          </p>
        ) : events.length === 0 ? (
          <div className="tl-pub-card" role="status">
            <p>
              No events are listed yet. When the club announces its next tournament it appears here,
              with its dates and its own page.
            </p>
            <p>
              <Link href="/">Back to the main page</Link>
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {events.map((event) => (
              <li key={event.tournamentId}>
                <Link className="tl-pub-card block h-full" href={`/events/${event.tournamentId}`}>
                  <span className="tl-pub-chip">{ARCHIVE_PHASE_LABELS[event.phase]}</span>
                  <span className="tl-pub-title">{event.name}</span>
                  <span>{dateRange(event.dates)}</span>
                  <span>{VENUE_LABEL}</span>
                  <span>{enteredLabel(event.entered)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="tl-pub-section" aria-label="More pages">
        <Link href="/">Main page</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/pairings">Published pairings</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/leaderboard">Leaderboard</Link>
      </nav>
    </div>
  );
}
