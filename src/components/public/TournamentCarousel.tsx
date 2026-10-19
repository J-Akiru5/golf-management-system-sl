"use client";

import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cutOffIsUrgent,
  cutOffLabel,
  dateRange,
  dayCount,
  daysBetween,
  enteredLabel,
  formatLabel,
  nextIndex,
  type PublicEvent,
} from "@/lib/public/highlights";

/** How long a slide stays before the next one. Long enough to read the cut-off line. */
const DWELL_MS = 7000;

/**
 * The strip of events a visitor can enter.
 *
 * One slide is rendered at a time rather than a translated track of all of them. That is deliberately
 * the duller build: a track holds the other slides in the DOM, so their links stay focusable unless
 * each one is managed by hand, and "the thing you cannot see still takes the Tab key" is the usual
 * way a carousel becomes unusable by keyboard.
 *
 * Motion is the visitor's choice. With `prefers-reduced-motion: reduce` there is no auto-advance at
 * all and the controls are the only way through.
 */
export function TournamentCarousel({ events, today }: { events: PublicEvent[]; today: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const region = useRef<HTMLDivElement>(null);

  // Read in an effect, never during render: the server has no opinion about motion, and guessing
  // would make the first client render disagree with the markup.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const go = useCallback(
    (step: number) => setIndex((current) => nextIndex(current, events.length, step)),
    [events.length],
  );

  const autoAdvancing = events.length > 1 && !paused && !reducedMotion;
  useEffect(() => {
    if (!autoAdvancing) return;
    const timer = setTimeout(() => go(1), DWELL_MS);
    return () => clearTimeout(timer);
  }, [autoAdvancing, go, index]);

  if (events.length === 0) return null;

  const event = events[index];
  if (!event) return null;

  const days = daysBetween(today, event.cutOffDate);
  const urgent = cutOffIsUrgent(days);

  return (
    <section
      className="tournament-strip"
      aria-labelledby="tournament-strip-title"
      // Pausing on hover or focus is what lets someone read a slide without it leaving.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="strip-head">
        <h2 id="tournament-strip-title">
          <span aria-hidden="true" />
          {events.length === 1 ? "Open for entry" : `${events.length} events open for entry`}
        </h2>
        {events.length > 1 && (
          <div className="strip-controls">
            <button type="button" onClick={() => go(-1)} aria-label="Previous event">
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="strip-dots" role="tablist" aria-label="Choose an event">
              {events.map((e, i) => (
                <button
                  key={e.tournamentId}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={e.name}
                  className={i === index ? "on" : ""}
                  onClick={() => setIndex(i)}
                />
              ))}
            </span>
            <button type="button" onClick={() => go(1)} aria-label="Next event">
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={region}
        className="strip-slide"
        // Announced when the visitor moves it, silent while it moves itself.
        aria-live={autoAdvancing ? "off" : "polite"}
        // The two together are what make it a carousel to a screen reader.
        role="group"
        aria-roledescription="carousel"
        aria-label={`Event ${index + 1} of ${events.length}`}
        // Focusable so the arrow keys below can actually reach it. Without this the region
        // advertised keyboard control that no keyboard could operate: the handler was there, but
        // the browser had nowhere to send the key.
        tabIndex={0}
        onKeyDown={(e) => {
          if (events.length < 2) return;
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(-1);
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(1);
          }
        }}
      >
        {/* Keyed so the slide replays its entrance; the animation is dropped for reduced motion. */}
        <article key={event.tournamentId} className="strip-card">
          <Image
            src="/brand/igcc-crest.png"
            alt=""
            width={72}
            height={72}
            className="strip-crest"
          />
          <div className="strip-body">
            <h3>{event.name}</h3>
            <p className="strip-dates">
              <CalendarDays aria-hidden="true" />
              <b>{dateRange(event.dates)}</b>
              <span>{dayCount(event.dates)}</span>
            </p>
            <p className="strip-meta">
              <Clock aria-hidden="true" />
              <span>{formatLabel(event.startFormat, event.firstTeeTime)}</span>
              <span className="strip-dot" aria-hidden="true" />
              <UsersRound aria-hidden="true" />
              <span>{enteredLabel(event.entered)}</span>
            </p>
            <p className={`strip-cutoff${urgent ? " urgent" : ""}`}>{cutOffLabel(days)}</p>
          </div>
          <Link className="strip-cta" href={`/enter/${event.tournamentId}`}>
            Enter <ArrowRight aria-hidden="true" />
          </Link>
        </article>
      </div>
    </section>
  );
}
