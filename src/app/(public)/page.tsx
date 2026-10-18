import { ArrowDown, ArrowRight, CalendarDays, Flag, Layers3, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { TeeLineLogo } from "@/components/TeeLineLogo";

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
    href: "/setup",
    link: "Explore the tournament desk",
  },
  {
    number: "02",
    icon: UsersRound,
    title: "A considered player record",
    description:
      "Review player details and imported handicap indexes, with eligibility and routing questions surfaced for the organizer.",
    href: "/players",
    link: "Visit the player directory",
  },
  {
    number: "03",
    icon: Layers3,
    title: "Pairings, ready to share",
    description:
      "Review the proposed groups, resolve draw issues, and publish a player view that keeps private profile details private.",
    href: "/draw",
    link: "See how the draw works",
  },
];

const steps = [
  ["01", "Prepare", "Set up the event and bring the player list together."],
  ["02", "Review", "Check the suggested groups and resolve anything that needs a closer look."],
  ["03", "Publish", "Release the approved pairings for players to find on their phones."],
];

export default function HomePage() {
  return (
    <main className="teeline-site">
      <section className="teeline-hero" aria-labelledby="hero-title">
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
          <Link className="site-nav-action" href="/admin">
            Organizer desk <ArrowRight aria-hidden="true" />
          </Link>
        </header>

        <div className="hero-content">
          <p className="hero-eyebrow">
            <span aria-hidden="true" /> A calmer way to run tournament day
          </p>
          <h1 id="hero-title">
            Every round,
            <br />
            <em>beautifully</em> organized.
          </h1>
          <p className="hero-copy">
            A clearer way to manage golf tournaments, player registrations, and the moments that
            bring the club together.
          </p>
          <div className="hero-actions">
            <Link className="button-light" href="/pairings">
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
          <Link className="button-outline" href="/admin">
            Explore the organizer desk <ArrowRight aria-hidden="true" />
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
        <p>Developed by Syntaxure Labs</p>
        <Link href="/admin">Organizer preview</Link>
      </footer>

      <aside className="preview-note" role="note">
        <span>Product preview</span>
        The organizer desk currently uses demo data. Changes reset when the page is refreshed; no
        database is connected yet.
      </aside>
    </main>
  );
}
