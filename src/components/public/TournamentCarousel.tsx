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
import { carouselSlides } from "@/lib/public/slides";

/** How long a slide stays before the next one. Long enough to read the cut-off line. */
const DWELL_MS = 6500;

/**
 * The strip of events a visitor can enter.
 *
 * It always shows two cards: whatever is open, then an explicit "nothing else scheduled" card. The
 * second one matters more than it looks. With a single event the strip used to be a static card, and
 * with none it disappeared, so a visitor could not tell an empty calendar from a failed read. A
 * fixed pair answers that without inventing an event.
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

  // More than one open event: show them all. Otherwise the open event (if any) plus the empty card.
  const slides = carouselSlides(events);
  const current = Math.min(index, slides.length - 1);

  const go = useCallback(
    (step: number) => setIndex((value) => nextIndex(value, slides.length, step)),
    [slides.length],
  );

  const autoAdvancing = slides.length > 1 && !paused && !reducedMotion;
  useEffect(() => {
    if (!autoAdvancing) return;
    const timer = setTimeout(() => go(1), DWELL_MS);
    return () => clearTimeout(timer);
  }, [autoAdvancing, go, index]);

  const event = slides[current] ?? null;
  const days = event ? daysBetween(today, event.cutOffDate) : 0;
  const urgent = event ? cutOffIsUrgent(days) : false;

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
          {events.every((e) => e.entriesOpen)
            ? events.length === 1
              ? "1 event open for entry"
              : `${events.length} events open for entry`
            : events.length === 1
              ? "1 event"
              : `${events.length} events`}
        </h2>
        {slides.length > 1 && (
          <div className="strip-controls">
            <button type="button" onClick={() => go(-1)} aria-label="Previous event">
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="strip-dots" role="tablist" aria-label="Choose an event">
              {slides.map((slide, i) => (
                <button
                  key={slide?.tournamentId ?? "no-upcoming"}
                  type="button"
                  role="tab"
                  aria-selected={i === current}
                  aria-label={slide?.name ?? "No upcoming events"}
                  className={i === current ? "on" : ""}
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
        aria-label={`Card ${current + 1} of ${slides.length}`}
        // Focusable so the arrow keys below can actually reach it. Without this the region
        // advertised keyboard control that no keyboard could operate: the handler was there, but
        // the browser had nowhere to send the key.
        tabIndex={0}
        onKeyDown={(e) => {
          if (slides.length < 2) return;
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
        <article key={event?.tournamentId ?? "no-upcoming"} className="strip-card">
          {event ? (
            <>
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
                {event.entriesOpen ? (
                  <p className={`strip-cutoff${urgent ? " urgent" : ""}`}>{cutOffLabel(days)}</p>
                ) : (
                  <p className="strip-cutoff">Entries closed</p>
                )}
              </div>
              <Link
                className="strip-cta"
                href={event.entriesOpen ? `/enter/${event.tournamentId}` : "/pairings"}
              >
                {event.entriesOpen ? "Enter" : "Pairings"} <ArrowRight aria-hidden="true" />
              </Link>
            </>
          ) : (
            <div className="strip-body strip-empty">
              <h3>No upcoming events yet</h3>
              <p className="strip-meta">
                The next tournament appears here the moment the club opens entries.
              </p>
              <p className="strip-cutoff">
                <Link href="/pairings">See the published pairings</Link>
              </p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
