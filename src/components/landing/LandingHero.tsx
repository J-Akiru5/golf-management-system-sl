import { Check, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { LandingMotion } from "./LandingMotion";
import type { LandingHeroProps } from "./types";

function TeeLineArtwork() {
  return (
    <svg
      className="tl-tee-art"
      viewBox="0 0 1440 640"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <g className="tl-contours" data-tl-parallax="0.15" stroke="#8DB39B" strokeWidth="1">
        <path d="M-100 470C100 386 250 435 392 344s246-166 411-72 232 88 367-14 230-158 395-78" />
        <path d="M-106 505C100 420 260 472 410 380s250-174 414-82 224 98 368-2 238-154 396-74" />
        <path d="M-112 540C100 454 270 510 428 416s254-180 417-92 216 108 369 10 246-150 397-70" />
        <path d="M-118 575C100 488 280 548 446 452s258-185 420-102 208 118 370 22 254-145 398-66" />
        <path d="M-124 610C100 522 290 586 464 488s260-190 423-112 200 128 371 34 262-140 399-62" />
        <path d="M80 660c104-150 270-140 360-258s162-198 307-176 196 176 334 150 184-140 360-104" />
      </g>
      <g className="tl-tee-line-layer" data-tl-parallax="0.35">
        <path
          className="tl-tee-line"
          data-tl-draw
          d="M-80 430C180 430 230 320 430 320s270 92 430 72 250-120 390-118 220 46 330 8"
        />
        <circle cx="790" cy="391" r="6" fill="#D7B568" />
      </g>
    </svg>
  );
}

export function LandingHero({
  featured,
  eventEyebrow,
  quickActions,
  eventStats,
  heroShot,
}: LandingHeroProps) {
  const primaryAction = quickActions.find((action) => action.primary);

  return (
    <section className="tl-hero" aria-labelledby="hero-title">
      <LandingMotion />
      <div className="tl-hero-atmosphere" data-tl-parallax="-0.1" aria-hidden="true" />
      <div className="tl-hero-noise" aria-hidden="true" />
      <div className="tl-hero-grid" aria-hidden="true" />
      <TeeLineArtwork />
      <header className="tl-nav-wrap">
        <Link href="/" className="tl-brand" aria-label="TeeLine Golf home">
          <TeeLineLogo variant="reverse" width={164} />
        </Link>
        <nav className="tl-nav-links" aria-label="Main navigation">
          <a href="#product">The desk</a>
          <a href="#how-it-works">How it works</a>
          <a href="#proof">In use</a>
          <a href="#about">About</a>
          <Link href="/pairings">Player pairings</Link>
          <Link href="/rules">Tournament rules</Link>
          <Link href="/faq">NGAP FAQ</Link>
        </nav>
        <div className="tl-nav-actions">
          <Link className="tl-sign-in" href="/login">
            Sign in
          </Link>
          <Link className="tl-button tl-button-light tl-nav-demo" href="/demo">
            Request a demo
          </Link>
        </div>
      </header>

      <div className="tl-hero-inner">
        {featured && primaryAction && (
          <Link className="tl-now-pill" href={primaryAction.href} data-tl-reveal>
            <span
              className={`tl-now-status${featured.finished ? " is-finished" : featured.phase === "live" ? " is-live" : ""}`}
              aria-hidden="true"
            >
              {featured.finished ? <Check /> : <i />}
            </span>
            <span className="tl-now-label">Now hosting</span>
            <span className="tl-now-divider" aria-hidden="true" />
            <span className="tl-now-event">{featured.name}</span>
            {featured.finished && <span className="tl-now-completed">Completed</span>}
            <span className="tl-now-action">
              {primaryAction.label} <ChevronRight aria-hidden="true" />
            </span>
          </Link>
        )}

        <div className="tl-club-hero">
          <p className="tl-kicker" data-tl-reveal>
            Tournament operations for golf clubs
          </p>
          <h1 id="hero-title" data-tl-reveal>
            A better desk for
            <br />
            tournament day.
          </h1>
          <p className="tl-hero-copy" data-tl-reveal>
            Run your golf tournament from entries to results from one desk.
          </p>
          <div className="tl-hero-actions" data-tl-reveal>
            <Link className="tl-button tl-button-light" href="/demo">
              Request a demo <ChevronRight aria-hidden="true" />
            </Link>
            <a className="tl-button tl-button-quiet" href="#product">
              See it in use
            </a>
          </div>
          <p className="tl-hero-proof" data-tl-reveal>
            First run at Iloilo Golf and Country Club <span>·</span> 327 entries <span>·</span> 0
            downtime
          </p>
        </div>

        {heroShot && (
          <div className="tl-hero-window-wrap" data-tl-tilt>
            <figure className="tl-hero-window">
              <div className="tl-window tl-hero-window-bar" aria-hidden="true">
                <i />
                <i />
                <i />
                <span>TOURNAMENT DESK</span>
              </div>
              <Image
                src={heroShot.src}
                alt={heroShot.alt}
                width={heroShot.width}
                height={heroShot.height}
                priority
                sizes="(max-width: 700px) 96vw, (max-width: 1200px) 92vw, 1000px"
              />
              {/* The control room's course map is a drawn layout. It must never read as IGCC's
                  real holes or tee data. */}
              {heroShot.src.includes("control-room") && (
                <p className="tl-illustrated-note tl-hero-note">
                  Illustrated layout · not IGCC’s real holes
                </p>
              )}
            </figure>
          </div>
        )}
      </div>

      {featured && (
        <aside className="tl-featured-band" aria-label="Featured event" data-tl-reveal>
          <div className="tl-featured-event">
            <p className="tl-featured-overline">
              {eventEyebrow}
              {featured.finished ? (
                <span className="tl-completed">
                  <Check aria-hidden="true" />
                  Completed
                </span>
              ) : featured.phase === "live" ? (
                <span className="tl-state tl-state-live">
                  <span aria-hidden="true" />
                  Live
                </span>
              ) : null}
            </p>
            <h2>{featured.name}</h2>
            <p className="tl-featured-date">{featured.dateLabel}</p>
            <p className="tl-featured-venue">
              Iloilo Golf and Country Club <span aria-hidden="true">·</span> {featured.enteredLabel}
            </p>
          </div>
          <dl className="tl-featured-stats" aria-label="Event at a glance">
            {eventStats.slice(0, 4).map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
          <div className="tl-featured-actions">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                className={`tl-button ${action.primary ? "tl-button-light" : "tl-button-quiet"}`}
                href={action.href}
              >
                {action.label}
                {action.primary && <ChevronRight aria-hidden="true" />}
              </Link>
            ))}
          </div>
        </aside>
      )}

      <div className="tl-hero-bottomline">
        <span>TEE LINE / TOURNAMENT DESK</span>
        <span>BUILT FOR THE COMMITTEE</span>
      </div>
    </section>
  );
}
