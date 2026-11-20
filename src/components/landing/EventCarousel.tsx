"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { EventCarouselProps, LandingEvent } from "./types";

function EventState({ event }: { event: LandingEvent }) {
  if (event.finished)
    return (
      <span className="tl-state tl-state-completed">
        <Check aria-hidden="true" />
        Completed
      </span>
    );
  if (event.phase === "live")
    return (
      <span className="tl-state tl-state-live">
        <span aria-hidden="true" />
        Live
      </span>
    );
  return <span className="tl-state">Upcoming</span>;
}

export function EventCarousel({ events }: EventCarouselProps) {
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const scroll = (direction: number) => {
    const node = track.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>(".tl-event-card");
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    node.scrollBy({
      left: direction * ((card?.offsetWidth ?? node.clientWidth) + 20),
      behavior,
    });
  };

  return (
    <section className="tl-events tl-section" aria-labelledby="tl-events-title">
      <div className="tl-events-heading">
        <div>
          <p className="tl-kicker">At the club</p>
          <h2 id="tl-events-title">Events at Iloilo Golf and Country Club</h2>
        </div>
        <div className="tl-carousel-controls">
          <span aria-live="polite">
            {position + 1} <i>/</i> {events.length}
          </span>
          {events.length > 1 && (
            <button type="button" aria-label="Previous event" onClick={() => scroll(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
          )}
          {events.length > 1 && (
            <button type="button" aria-label="Next event" onClick={() => scroll(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {events.length ? (
        <div
          className="tl-event-track"
          ref={track}
          role="region"
          aria-label="Tournament events"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              scroll(-1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              scroll(1);
            }
          }}
          onScroll={(event) => {
            const node = event.currentTarget;
            const card = node.querySelector<HTMLElement>(".tl-event-card");
            if (card)
              setPosition(
                Math.min(events.length - 1, Math.round(node.scrollLeft / (card.offsetWidth + 20))),
              );
          }}
        >
          {events.map((event) => (
            <article
              className={`tl-event-card${event.finished ? " is-finished" : ""}`}
              key={event.tournamentId}
            >
              <div className="tl-event-card-top">
                <span className="tl-event-index">
                  {String(events.indexOf(event) + 1).padStart(2, "0")}
                </span>
                <EventState event={event} />
              </div>
              <h3>{event.name}</h3>
              <p className="tl-card-date">{event.dateLabel}</p>
              <div className="tl-card-meta">
                <span>Iloilo Golf and Country Club</span>
                <span>{event.enteredLabel}</span>
              </div>
              <div className="tl-card-links">
                <Link href="/pairings">Pairings</Link>
                <Link href="/results/all">Scores</Link>
                {event.entriesOpen && <Link href={`/enter/${event.tournamentId}`}>Enter</Link>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="tl-events-empty">There are no listed events right now.</p>
      )}
    </section>
  );
}
