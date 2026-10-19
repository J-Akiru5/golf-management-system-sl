import { ArrowDown, ArrowRight, CalendarDays, Flag, Layers3, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { TournamentCarousel } from "@/components/public/TournamentCarousel";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { loadPublicOpenEvents } from "@/lib/data/supabase/public-events";
import { demoOpenEvents } from "@/lib/public/demo-events";
import {
  cutOffLabel,
  dateRange,
  daysBetween,
  enteredLabel,
  formatLabel,
  type PublicEvent,
} from "@/lib/public/highlights";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { APP_VERSION_LABEL } from "@/lib/version";

/**
 * Today, as the server sees it, in the club's timezone.
 *
 * Passed into the carousel rather than looked up there: this page is server rendered and then
 * hydrated, so a countdown computed on both sides from `new Date()` would disagree across midnight
 * and React would report a mismatch. One clock, read once, on the server.
 */
function todayInManila(): string {
  // en-CA gives YYYY-MM-DD, which is the form the database and the helpers both use.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/**
 * The events a visitor can enter, or nothing.
 *
 * `null` from the loader means the read failed, which includes the migration that adds
 * `public_open_events()` not being applied yet. That is shown as no strip rather than as the sample
 * events: a live site inventing a tournament is worse than a page with one section fewer.
 */
async function openEvents(today: string): Promise<PublicEvent[]> {
  if (!isSupabaseConfigured()) return demoOpenEvents(today);
  try {
    return (await loadPublicOpenEvents(createSupabasePublicClient())) ?? [];
  } catch {
    return [];
  }
}

/**
 * The event's days as a fixtures strip, the way a sports site shows a schedule.
 *
 * Every value is real. The dates are the ones the organizer entered and the tee time is the event's
 * first tee, so the strip cannot say anything the desk does not already hold. Weekday names are
 * formatted on the server in Manila time with a fixed locale, so the markup matches in every browser
 * and does not change across midnight.
 */
function ScheduleStrip({ event }: { event: PublicEvent }) {
  const days = event.dates.map((date) => {
    const at = new Date(`${date}T00:00:00Z`);
    const part = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(at);
    return {
      date,
      weekday: part({ weekday: "short" }),
      day: part({ day: "2-digit" }),
      month: part({ month: "short" }),
    };
  });

  return (
    <section className="site-schedule" aria-labelledby="schedule-title">
      <div>
        <p className="section-kicker">Schedule</p>
        <h2 id="schedule-title">{event.name}</h2>
        <p className="schedule-meta">{formatLabel(event.startFormat, event.firstTeeTime)}</p>
      </div>
      <ol className="schedule-days">
        {days.map((day) => (
          <li key={day.date}>
            <span className="schedule-weekday">{day.weekday}</span>
            <b className="schedule-day">{day.day}</b>
            <span className="schedule-month">{day.month}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export const metadata: Metadata = {
  title: "Every round, beautifully organized",
  description:
    "A clearer way to manage golf tournaments, player registrations, and the moments that bring the club together.",
  openGraph: {
    title: "TeeLine Golf | Every round, beautifully organized",
    description:
      "A clearer way to manage golf tournaments, player registrations, and the moments that bring the club together.",
  },
};

const capabilities = [
  {
    number: "01",
    icon: CalendarDays,
    title: "Tournament operations",
    description:
      "Keep event settings, registration details, categories, and start arrangements together in one clear workspace.",
    href: "/login",
    link: "Sign in to the desk",
  },
  {
    number: "02",
    icon: UsersRound,
    title: "A considered player record",
    description:
      "Review player details and imported handicap indexes, with eligibility and routing questions surfaced for the organizer.",
    href: "/login",
    link: "Sign in to the desk",
  },
  {
    number: "03",
    icon: Layers3,
    title: "Pairings, ready to share",
    description:
      "Review the proposed groups, resolve draw issues, and publish a player view that keeps private profile details private.",
    href: "/login",
    link: "Sign in to the desk",
  },
];

const steps = [
  ["01", "Prepare", "Set up the event and bring the player list together."],
  ["02", "Review", "Check the suggested groups and resolve anything that needs a closer look."],
  ["03", "Publish", "Release the approved pairings for players to find on their phones."],
];

export default async function HomePage() {
  const today = todayInManila();
  const events = await openEvents(today);
  const featured = events[0] ?? null;

  return (
    <main className="teeline-site">
      <section
        className={`teeline-hero${events.length > 0 ? " with-strip" : ""}`}
        aria-labelledby="hero-title"
      >
        <Image
          src="/course/hole-1/overview.webp"
          alt="Illustrated golf fairway running between wooded course contours"
          fill
          priority
          sizes="100vw"
          className="hero-photo"
        />
        <div className="hero-shade" aria-hidden="true" />

        <header className="site-nav">
          <Link href="/" className="site-brand">
            <TeeLineLogo variant="reverse" width={214} />
          </Link>
          <nav aria-label="Main navigation" className="site-nav-links">
            <a href="#experience">The experience</a>
            <a href="#workflow">How it works</a>
            <Link href="/pairings">Player pairings</Link>
          </nav>
          <Link className="site-nav-action" href="/login">
            Sign in <ArrowRight aria-hidden="true" />
          </Link>
        </header>

        <div className="hero-content">
          <p className="hero-eyebrow">
            <span aria-hidden="true" />{" "}
            {featured ? "Open for entry now" : "A calmer way to run tournament day"}
          </p>
          {featured ? (
            <>
              <h1 id="hero-title" className={featured ? "event-title" : undefined}>
                {featured.name}
                <br />
                <em>{dateRange(featured.dates)}</em>
              </h1>
              <p className="hero-copy">
                {formatLabel(featured.startFormat, featured.firstTeeTime)} ·{" "}
                {cutOffLabel(daysBetween(today, featured.cutOffDate))} ·{" "}
                {enteredLabel(featured.entered)}
              </p>
            </>
          ) : (
            <>
              <h1 id="hero-title">
                Every round,
                <br />
                <em>beautifully</em> organized.
              </h1>
              <p className="hero-copy">
                A clearer way to manage golf tournaments, player registrations, and the moments that
                bring the club together.
              </p>
            </>
          )}
          <div className="hero-actions">
            {featured && (
              <Link className="button-light" href={`/enter/${featured.tournamentId}`}>
                Enter this event <ArrowRight aria-hidden="true" />
              </Link>
            )}
            <Link className={featured ? "button-quiet" : "button-light"} href="/pairings">
              View published pairings <ArrowRight aria-hidden="true" />
            </Link>
            <a className="button-quiet" href="#experience">
              Discover TeeLine <ArrowDown aria-hidden="true" />
            </a>
          </div>
        </div>

        <aside className="hero-note" aria-label="TeeLine product introduction">
          <span className="hero-note-mark" aria-hidden="true">
            <Flag />
          </span>
          <span>
            <b>Made for the whole day</b>
            <small>From the first entry to the first tee.</small>
          </span>
        </aside>
        <p className="hero-caption">Illustrative course artwork · not a photograph of IGCC</p>
        <a
          className="hero-scroll"
          href="#experience"
          aria-label="Scroll to explore the TeeLine experience"
        >
          <span>Scroll to explore</span>
          <ArrowDown aria-hidden="true" />
        </a>
      </section>

      {events.length > 0 && <TournamentCarousel events={events} today={today} />}
      {featured && <ScheduleStrip event={featured} />}

      <section id="experience" className="experience-section">
        <div className="section-intro">
          <p className="section-kicker">TeeLine Golf · Tournament desk</p>
          <h2>Less time untangling details. More time together on the course.</h2>
          <p>
            Tournament-day work has a rhythm. TeeLine brings the practical pieces into one focused
            flow, so organizers can make decisions with clarity and golfers can find the information
            they need.
          </p>
        </div>

        <div className="capability-list" aria-label="TeeLine capabilities">
          {capabilities.map(({ number, icon: Icon, title, description, href, link }) => (
            <article className="capability" key={number}>
              <div className="capability-topline">
                <span>{number}</span>
                <Icon aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <Link href={href}>
                {link} <ArrowRight aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="workflow-section">
        <div className="workflow-heading">
          <p className="section-kicker">A clear path to the first tee</p>
          <h2>Good tournament days start with a plan.</h2>
          <p>
            Keep the organizer in control at every step. TeeLine proposes; the club reviews and
            decides what is ready to publish.
          </p>
          <Link className="button-outline" href="/login">
            Sign in to the desk <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ol className="workflow-steps">
          {steps.map(([number, title, description]) => (
            <li key={number}>
              <span className="step-number">{number}</span>
              <span>
                <b>{title}</b>
                <small>{description}</small>
              </span>
            </li>
          ))}
        </ol>
        <svg className="workflow-contours" viewBox="0 0 640 380" fill="none" aria-hidden="true">
          <path d="M-40 292C114 242 144 94 330 96c122 1 145 121 329 37" />
          <path d="M-45 319C105 274 163 123 331 123c118 0 157 118 336 47" />
          <path d="M-42 347C105 306 178 153 334 151c116-1 166 112 341 59" />
          <path d="M-20 375C115 337 200 184 339 179c119-5 173 104 347 72" />
        </svg>
      </section>

      <section className="pairings-callout">
        <div>
          <p className="section-kicker">For players</p>
          <h2>When pairings are published, they should be easy to find.</h2>
          <p>Search the approved player view by name. No private profile details, no guesswork.</p>
        </div>
        <Link className="button-dark" href="/pairings">
          Open player pairings <ArrowRight aria-hidden="true" />
        </Link>
      </section>

      <footer className="site-footer">
        <Link href="/">
          <TeeLineLogo variant="reverse" width={190} />
        </Link>
        <p>
          Developed by Syntaxure Labs · <span className="select-all">{APP_VERSION_LABEL}</span>
        </p>
        <Link href="/login">Sign in</Link>
      </footer>

      <aside className="preview-note" role="note">
        <span>Product preview</span>
        {isSupabaseConfigured()
          ? "The desk and the player area are behind sign-in. Pairings stay public."
          : "This build runs on demo data with no accounts. Changes reset when the page is refreshed."}
      </aside>
    </main>
  );
}
