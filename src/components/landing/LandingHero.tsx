"use client";

import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import type { HeroView, LandingHeroProps } from "./types";

function TeeLineArtwork() {
  return (
    <svg
      className="tl-tee-art"
      viewBox="0 0 1440 640"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <g className="tl-contours" stroke="#8DB39B" strokeWidth="1">
        <path d="M-80 486C140 380 250 440 390 340s240-162 410-66 230 83 360-20 230-154 390-78" />
        <path d="M-90 526C130 420 260 486 410 382s240-170 410-76 220 96 360-8 240-150 390-72" />
        <path d="M-100 566C120 460 270 532 430 424s240-178 410-86 210 109 360 4 250-145 390-66" />
        <path d="M-110 606C110 500 280 578 450 466s240-186 410-96 200 122 360 16 260-140 390-60" />
        <path d="M90 650c100-140 270-134 350-250s150-208 300-188 194 182 330 154 180-142 354-108" />
      </g>
      <path
        className="tl-tee-line"
        d="M-80 430C180 430 230 320 430 320s270 92 430 72 250-120 390-118 220 46 330 8"
      />
      <circle cx="790" cy="391" r="5" fill="#D7B568" />
    </svg>
  );
}

export function LandingHero(props: LandingHeroProps) {
  const [view, setView] = useState<HeroView>(props.featured ? props.defaultView : "clubs");
  const tabsId = useId();
  const eventTabLabel =
    props.featured && props.featured.name.length <= 23 ? props.featured.name : "Now hosting";
  const tabs: { id: HeroView; label: string }[] = [
    { id: "clubs", label: "For clubs" },
    { id: "event", label: eventTabLabel },
  ];

  function moveTab(key: string) {
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
    const next = key === "Home" || key === "ArrowLeft" ? "clubs" : "event";
    setView(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  }

  return (
    <section className="tl-hero" aria-labelledby="hero-title">
      <div className="tl-hero-atmosphere" aria-hidden="true" />
      <TeeLineArtwork />
      <header className="tl-nav-wrap">
        <Link href="/" className="tl-brand">
          <TeeLineLogo variant="reverse" width={164} />
        </Link>
        <nav className="tl-nav-links" aria-label="Main navigation">
          <a href="#product">The desk</a>
          <a href="#how-it-works">How it works</a>
          <a href="#proof">In use</a>
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
        {props.featured && (
          <div className="tl-hero-switch" role="tablist" aria-label="Landing page view">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`${tabsId}-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                aria-controls={`${tabsId}-panel`}
                tabIndex={view === tab.id ? 0 : -1}
                onClick={() => setView(tab.id)}
                onKeyDown={(event) => moveTab(event.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div
          id={props.featured ? `${tabsId}-panel` : undefined}
          role={props.featured ? "tabpanel" : undefined}
          aria-labelledby={props.featured ? `${tabsId}-${view}` : undefined}
          className="tl-hero-panel"
        >
          {view === "event" && props.featured ? (
            <div className="tl-event-hero">
              <p className="tl-event-eyebrow">
                <span aria-hidden="true" />
                {props.eventEyebrow}
                {props.featured.finished && (
                  <span className="tl-completed">
                    <Check aria-hidden="true" />
                    Completed
                  </span>
                )}
              </p>
              <h1 id="hero-title" className="tl-event-title">
                {props.featured.name}
              </h1>
              <p className="tl-event-date">{props.featured.dateLabel}</p>
              <p className="tl-event-meta">
                Iloilo Golf and Country Club <span aria-hidden="true">·</span>{" "}
                {props.featured.enteredLabel}
              </p>
              <div className="tl-hero-actions">
                {props.quickActions.map((action) => (
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
              <dl className="tl-event-stats" aria-label="Event at a glance">
                {props.eventStats.slice(0, 4).map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <div className="tl-club-hero">
              <p className="tl-kicker">Tournament operations for golf clubs</p>
              <h1 id="hero-title">
                A better desk for
                <br />
                tournament day.
              </h1>
              <p className="tl-hero-copy">
                Run your golf tournament from entries to results from one desk.
              </p>
              <div className="tl-hero-actions">
                <Link className="tl-button tl-button-light" href="/demo">
                  Request a demo <ChevronRight aria-hidden="true" />
                </Link>
                <a className="tl-button tl-button-quiet" href="#product">
                  See it in use
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="tl-hero-bottomline">
        <span>TEE LINE / TOURNAMENT DESK</span>
        <span>BUILT FOR THE COMMITTEE</span>
      </div>
    </section>
  );
}
