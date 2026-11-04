import { ArrowDown, ArrowRight, CalendarDays, Layers3, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { MotionLayer } from "@/components/public/MotionLayer";
import { TournamentCarousel } from "@/components/public/TournamentCarousel";
import { JsonLd } from "@/components/seo/JsonLd";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadPublicEvents } from "@/lib/data/supabase/public-events";
import { demoOpenEvents } from "@/lib/public/demo-events";
import {
  cutOffLabel,
  dateRange,
  daysBetween,
  enteredLabel,
  formatLabel,
  type PublicEvent,
} from "@/lib/public/highlights";
import {
  openGraphFor,
  SITE_DESCRIPTION,
  SITE_NAME,
  softwareApplicationSchema,
  twitterFor,
} from "@/lib/seo";
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
    return (await loadPublicEvents(createSupabasePublicClient())) ?? [];
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
  title: "Golf tournament management for clubs in the Philippines",
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: openGraphFor({
    title: `Golf tournament management for clubs in the Philippines | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  twitter: twitterFor({
    title: `Golf tournament management for clubs in the Philippines | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
  }),
};

const capabilities = [
  {
    number: "01",
    icon: CalendarDays,
    title: "Tournament operations",
    description:
      "Keep event settings, registration details, categories, and start arrangements together in one clear workspace.",
    image: "/photos/tee-box.webp",
    href: "/login",
    link: "Sign in to the desk",
  },
  {
    number: "02",
    icon: UsersRound,
    title: "A considered player record",
    description:
      "Review player details and imported handicap indexes, with eligibility and routing questions surfaced for the organizer.",
    image: "/photos/scorecard.webp",
    href: "/login",
    link: "Sign in to the desk",
  },
  {
    number: "03",
    icon: Layers3,
    title: "Pairings, ready to share",
    description:
      "Review the proposed groups, resolve draw issues, and publish a player view that keeps private profile details private.",
    image: "/photos/players-fairway.webp",
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

  // Formatted here, on the server, so the stat strip cannot differ between browsers.
  const cutOffShort = featured
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${featured.cutOffDate}T00:00:00Z`))
    : null;

  return (
    <main className="teeline-site mobile-bar-space">
      <JsonLd data={softwareApplicationSchema()} />
      <MotionLayer />
      <section
        className={`teeline-hero${events.length > 0 ? " with-strip" : ""}`}
        aria-labelledby="hero-title"
      >
        {/* Decorative only: a plain field, not a photograph. Layered gradients and inline SVG give
            it the club's own language (a green, yardage arcs, a flag) and nothing is downloaded. */}
        <div className="hero-canvas" aria-hidden="true">
          <span className="hero-glow hero-glow-a" />
          <span className="hero-glow hero-glow-b" />
          <svg
            className="hero-contours"
            viewBox="0 0 1440 820"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
          >
            <defs>
              <linearGradient id="hero-contour-stroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#d8bd81" stopOpacity="0.32" />
                <stop offset="55%" stopColor="#d8bd81" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#d8bd81" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="hero-green" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#3f9a70" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#3f9a70" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="1128" cy="486" r="380" fill="url(#hero-green)" />
            <g stroke="url(#hero-contour-stroke)" strokeWidth="1.4">
              <path d="M-60 690C170 612 236 430 470 408c214-20 306 128 508 76 186-48 268-198 522-156" />
              <path d="M-60 728C174 654 252 470 482 446c208-22 314 126 514 82 182-40 274-186 524-140" />
              <path d="M-70 766C178 698 268 512 494 486c204-22 322 122 520 88 176-32 280-174 526-124" />
              <path d="M-80 804C182 742 284 556 506 526c200-24 330 118 526 94 170-22 286-160 528-108" />
            </g>
            <g stroke="#d8bd81" strokeOpacity="0.24" strokeDasharray="2 11">
              <circle cx="1128" cy="486" r="150" />
              <circle cx="1128" cy="486" r="234" />
              <circle cx="1128" cy="486" r="318" />
            </g>
            <g stroke="#d8bd81" strokeOpacity="0.55" strokeWidth="2">
              <path d="M1128 486v-132" />
              <path d="M1128 354l62 21-62 21z" fill="#d8bd81" fillOpacity="0.3" />
            </g>
          </svg>
          <span className="hero-grid" />
        </div>

        <header className="site-nav">
          <Link href="/" className="site-brand">
            <TeeLineLogo variant="reverse" width={214} />
          </Link>
          <nav aria-label="Main navigation" className="site-nav-links">
            <a href="#experience">The experience</a>
            <a href="#workflow">How it works</a>
            <Link href="/pairings">Player pairings</Link>
            <Link href="/faq">NGAP FAQ</Link>
          </nav>
          <div className="site-nav-end">
            <ThemeToggle compact tone="nav" />
            <Link className="site-nav-action" href="/login">
              Sign in <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className="hero-content">
          <p className="hero-eyebrow">
            <span aria-hidden="true" />{" "}
            {featured
              ? featured.entriesOpen
                ? "Open for entry now"
                : "Entries closed"
              : "A calmer way to run tournament day"}
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
            {featured && featured.entriesOpen && (
              <Link className="button-light" href={`/enter/${featured.tournamentId}`}>
                Enter this event <ArrowRight aria-hidden="true" />
              </Link>
            )}
            <Link
              className={featured?.entriesOpen ? "button-quiet" : "button-light"}
              href="/pairings"
            >
              View published pairings <ArrowRight aria-hidden="true" />
            </Link>
            <a className="button-quiet" href="#experience">
              Discover TeeLine <ArrowDown aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* The benchmark's first move: put a number where the slogan would go. Every value is the
            event's own; the strip is absent entirely when there is no open event to describe. */}
        {featured && (
          <dl className="hero-stats" aria-label="Event at a glance">
            <div>
              <dt>Entries</dt>
              <dd>{featured.entered}</dd>
            </div>
            <div>
              <dt>Cut-off</dt>
              <dd>{cutOffShort}</dd>
            </div>
            <div>
              <dt>Days</dt>
              <dd>{featured.dates.length}</dd>
            </div>
            <div>
              <dt>First tee</dt>
              <dd>{featured.firstTeeTime}</dd>
            </div>
          </dl>
        )}
      </section>

      {events.length > 0 && <TournamentCarousel events={events} today={today} />}
      {featured && <ScheduleStrip event={featured} />}

      <section id="what-is-teeline" className="experience-section">
        <div className="section-intro" data-motion="reveal">
          <p className="section-kicker">Golf tournament software</p>
          <h2>Tournament management for golf clubs in the Philippines.</h2>
          <p>
            TeeLine Golf runs a tournament from the first entry to the printed sheet: player
            registration, handicap-based categories and flights, the draw with its start waves,
            published pairings that players can open without an account, and the start sheets and
            scorecards the desk prints. It works on a phone at the course and on a laptop in the
            office.
          </p>
        </div>
      </section>

      <section id="experience" className="experience-section">
        <div className="section-intro" data-motion="reveal">
          <p className="section-kicker">TeeLine Golf · Tournament desk</p>
          <h2>Less time untangling details. More time together on the course.</h2>
          <p>
            Tournament-day work has a rhythm. TeeLine brings the practical pieces into one focused
            flow, so organizers can make decisions with clarity and golfers can find the information
            they need.
          </p>
        </div>

        <div className="capability-list" aria-label="TeeLine capabilities" data-motion="group">
          {capabilities.map(({ number, icon: Icon, title, description, image, href, link }) => (
            <article className="capability" key={number} data-motion="item">
              {/* Decorative: the card's meaning is in the words, so the photo carries no alt text. */}
              <div className="capability-media">
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="(max-width: 900px) 100vw, 33vw"
                  className="capability-photo"
                />
              </div>
              <div className="capability-body">
                <div className="capability-topline">
                  <span>{number}</span>
                  <Icon aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
                <Link href={href}>
                  {link} <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="workflow-section">
        <div className="workflow-heading" data-motion="reveal">
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
        <ol className="workflow-steps" data-motion="group">
          {steps.map(([number, title, description]) => (
            <li key={number} data-motion="item">
              <span className="step-number">{number}</span>
              <span>
                <b>{title}</b>
                <small>{description}</small>
              </span>
            </li>
          ))}
        </ol>
        <svg
          className="workflow-contours"
          viewBox="0 0 640 380"
          fill="none"
          aria-hidden="true"
          data-motion="parallax"
        >
          <path d="M-40 292C114 242 144 94 330 96c122 1 145 121 329 37" />
          <path d="M-45 319C105 274 163 123 331 123c118 0 157 118 336 47" />
          <path d="M-42 347C105 306 178 153 334 151c116-1 166 112 341 59" />
          <path d="M-20 375C115 337 200 184 339 179c119-5 173 104 347 72" />
        </svg>
      </section>

      <section className="pairings-callout" data-motion="reveal">
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
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" aria-label="TeeLine Golf home">
              <TeeLineLogo variant="reverse" width={190} />
            </Link>
            <p>
              The tournament desk for Iloilo Golf and Country Club. Entries, the draw and the
              published pairings, in one place.
            </p>
          </div>

          <nav className="footer-col" aria-label="Product">
            <h2>Product</h2>
            <Link href="/pairings">Published pairings</Link>
            <Link href="/leaderboard">Public leaderboard</Link>
            <Link href="/login">Sign in to the desk</Link>
          </nav>

          <div className="footer-col">
            <h2>Club</h2>
            <p>Iloilo Golf and Country Club</p>
            <p className="footer-placeholder">[Contact address to be confirmed by the club]</p>
          </div>

          <nav className="footer-col" aria-label="Legal">
            <h2>Legal</h2>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of service</Link>
          </nav>
        </div>

        <div className="footer-bar">
          <p>© {new Date().getFullYear()} Iloilo Golf and Country Club</p>
          <p>
            Developed by Syntaxure Labs · <span className="select-all">{APP_VERSION_LABEL}</span>
          </p>
          <Link href="/login">Sign in</Link>
        </div>

        <p className="footer-credit">
          Photographs from Unsplash and Pexels, used under their free licences. Sources are recorded
          in the repository.
        </p>
      </footer>

      <aside className="preview-note" role="note">
        <span>Product preview</span>
        {isSupabaseConfigured()
          ? "The desk and the player area are behind sign-in. Pairings stay public."
          : "This build runs on demo data with no accounts. Changes reset when the page is refreshed."}
      </aside>
      <PlayerBottomBar />
    </main>
  );
}
