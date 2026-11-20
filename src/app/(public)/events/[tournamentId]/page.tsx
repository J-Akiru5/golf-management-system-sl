import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicShell } from "@/components/public/PublicShell";
import { buildTeamLeaderboard } from "@/lib/data/public-team-leaderboard";
import {
  ARCHIVE_PHASE_LABELS,
  type ArchivedEvent,
  loadEventArchive,
} from "@/lib/data/supabase/event-archive";
import {
  readPublicPairings,
  readPublicProgramme,
  readPublicReleaseState,
  readPublicTeamLeaderboard,
} from "@/lib/data/supabase/public-cache";
import { dateRange, enteredLabel, timeLabel, VENUE_LABEL } from "@/lib/public/highlights";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { todayInManila } from "../_lib/today";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One event's portfolio page.
 *
 * The event itself comes from the same archive read as /events, so an id that is not a public event
 * is a 404 rather than a page built from a guess. Each section then asks the public read that
 * already exists for one tournament: the release state first, because a held section renders
 * nothing at all, then the programme (days and the organizer's rules of play), the frozen published
 * pairings and the released leaderboard. Where there is no per-tournament public read the section
 * links to the page that does have one instead of inventing a copy.
 *
 * `cache` keeps the event read shared between generateMetadata and the page in one request.
 */
const findEvent = cache(async (tournamentId: string): Promise<ArchivedEvent | null> => {
  if (!isSupabaseConfigured()) return null;
  const today = todayInManila();
  const events = await loadEventArchive(createSupabasePublicClient(), today);
  return events?.find((event) => event.tournamentId === tournamentId) ?? null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}): Promise<Metadata> {
  const { tournamentId } = await params;
  const event = UUID.test(tournamentId) ? await findEvent(tournamentId).catch(() => null) : null;
  if (!event) {
    return { title: "Event not found", robots: { index: false, follow: false } };
  }
  const dates = dateRange(event.dates);
  const description = `${event.name}, ${dates} at ${VENUE_LABEL}. Pairings, results and the organizer's rules of play.`;
  return {
    title: event.name,
    description,
    alternates: { canonical: `/events/${event.tournamentId}` },
    openGraph: openGraphFor({
      title: `${event.name} | ${SITE_NAME}`,
      description,
      path: `/events/${event.tournamentId}`,
    }),
    twitter: twitterFor({ title: `${event.name} | ${SITE_NAME}`, description }),
  };
}

/** The two or three things a visitor can do next, in the order the event's moment asks for them. */
function quickActions(event: ArchivedEvent): { label: string; href: string }[] {
  const actions = [
    { label: "Published pairings", href: "/pairings" },
    { label: "All scores", href: "/results/all" },
    { label: "Leaderboard", href: "/leaderboard" },
  ];
  if (event.entriesOpen) actions.push({ label: "Enter", href: `/enter/${event.tournamentId}` });
  return actions;
}

export default async function EventPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  if (!UUID.test(tournamentId)) notFound();

  const event = await findEvent(tournamentId);
  if (!event) notFound();

  const [release, programme] = await Promise.all([
    readPublicReleaseState(tournamentId).catch(() => null),
    readPublicProgramme(tournamentId).catch(() => null),
  ]);

  // Held sections ask for nothing. The release state is the gate the desk already controls.
  const resultsHeld = release?.leaderboard === false;
  const pairingsHeld = release?.pairings === false;
  const rulesHeld = release?.rules === false;

  const [pairings, leaderboard] = await Promise.all([
    pairingsHeld ? Promise.resolve(null) : readPublicPairings(tournamentId).catch(() => null),
    resultsHeld ? Promise.resolve(null) : readPublicTeamLeaderboard(tournamentId).catch(() => null),
  ]);

  const published = pairings?.published ?? null;
  const groups = published?.groups ?? [];
  const top = leaderboard ? buildTeamLeaderboard(leaderboard).teams.slice(0, 3) : [];
  const rulesText = rulesHeld ? null : (programme?.rulesOfPlay ?? null);

  return (
    <PublicShell wide>
      <header className="tl-pub-section">
        <div className="flex flex-wrap items-center gap-3">
          <span className="tl-pub-chip">{ARCHIVE_PHASE_LABELS[event.phase]}</span>
          <span className="tl-pub-kicker">{dateRange(event.dates)}</span>
        </div>
        <h1 className="tl-pub-title">{event.name}</h1>
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="tl-pub-kicker">Dates</dt>
            <dd>{dateRange(event.dates)}</dd>
          </div>
          <div>
            <dt className="tl-pub-kicker">Venue</dt>
            <dd>{VENUE_LABEL}</dd>
          </div>
          <div>
            <dt className="tl-pub-kicker">Entered</dt>
            <dd>{enteredLabel(event.entered)}</dd>
          </div>
        </dl>
      </header>

      <nav className="tl-pub-section" aria-label="On this page">
        {groups.length > 0 && <a href="#pairings">Pairings</a>}
        {top.length > 0 && <a href="#results">Results</a>}
        {rulesText && <a href="#rules">Rules of play</a>}
      </nav>

      {groups.length > 0 && (
        <section className="tl-pub-section" id="pairings" aria-labelledby="pairings-title">
          <h2 id="pairings-title" className="tl-pub-title">
            Published pairings
          </h2>
          <p>
            The frozen draw the desk published. Tee times are the club&rsquo;s; the{" "}
            <Link href="/pairings">pairings page</Link> has the same groups with the player cards.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <li
                className="tl-pub-card"
                key={`${group.dayNumber ?? 1}:${group.number}`}
                aria-label={`Group ${group.number}`}
              >
                <p className="tl-pub-kicker">
                  Group {group.number} · {timeLabel(group.time)} · hole {group.startHole}
                </p>
                <p>{group.flight}</p>
                <ul>
                  {group.players.map((player, index) => (
                    <li key={group.playerIds?.[index] ?? `${group.number}-${player}`}>{player}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {pairings?.skippedRows ? (
            <p className="tl-pub-card" role="status">
              Part of the published draw could not be read, so{" "}
              {pairings.skippedRows === 1 ? "1 row is" : `${pairings.skippedRows} rows are`} not
              shown here.
            </p>
          ) : null}
        </section>
      )}

      {top.length > 0 && (
        <section className="tl-pub-section" id="results" aria-labelledby="results-title">
          <h2 id="results-title" className="tl-pub-title">
            Published results
          </h2>
          <p>
            The top of the released table for this event. The full board is on the{" "}
            <Link href="/results/all">all scores page</Link>.
          </p>
          <ol className="grid gap-3 sm:grid-cols-3">
            {top.map((team) => (
              <li className="tl-pub-card" key={team.key}>
                <p className="tl-pub-kicker">
                  {team.tied ? `Rank ${team.rank}, tied` : `Rank ${team.rank}`}
                </p>
                <p className="tl-pub-title">{team.name}</p>
                <p>
                  {[
                    team.toPar,
                    team.netPoints === null ? null : `${team.netPoints} net points`,
                    `${team.holesCounted} holes`,
                  ]
                    .filter((part): part is string => part !== null && part !== "")
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {rulesText && (
        <section className="tl-pub-section" id="rules" aria-labelledby="rules-title">
          <h2 id="rules-title" className="tl-pub-title">
            Rules of play
          </h2>
          <p>The organizer&rsquo;s rules for this event, as published.</p>
          <div className="tl-pub-card whitespace-pre-wrap">{rulesText}</div>
        </section>
      )}

      <section className="tl-pub-section" aria-labelledby="actions-title">
        <h2 id="actions-title" className="tl-pub-title">
          What to do next
        </h2>
        <ul className="flex flex-wrap gap-3">
          {quickActions(event).map((action) => (
            <li key={action.href}>
              <Link className="tl-pub-chip" href={action.href}>
                {action.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <nav className="tl-pub-section" aria-label="More pages">
        <Link href="/events">All events</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/">Main page</Link>
      </nav>
    </PublicShell>
  );
}
