"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
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
  const isSingle = events.length === 1;
  const track = useRef<HTMLDivElement>(null);
  const positionLabel = useRef<HTMLSpanElement>(null);
  const cardStep = useRef(0);

  useEffect(() => {
    const node = track.current;
    if (!node || isSingle) return;

    const cards = Array.from(node.querySelectorAll<HTMLElement>(".tl-event-card"));
    let activeIndex = 0;
    const updatePosition = () => {
      const step = cardStep.current;
      if (step <= 0) return;
      const nextIndex = Math.min(events.length - 1, Math.round(node.scrollLeft / step));
      if (nextIndex === activeIndex) return;
      cards[activeIndex]?.classList.remove("is-active");
      cards[nextIndex]?.classList.add("is-active");
      activeIndex = nextIndex;
      if (positionLabel.current) {
        positionLabel.current.textContent = `${activeIndex + 1} / ${events.length}`;
      }
    };
    const measureCard = () => {
      const card = cards[0];
      if (card) cardStep.current = card.getBoundingClientRect().width + 20;
      updatePosition();
    };

    node.addEventListener("scroll", updatePosition, { passive: true });
    const resizeObserver = new ResizeObserver(measureCard);
    resizeObserver.observe(node);
    if (cards[0]) resizeObserver.observe(cards[0]);
    measureCard();

    return () => {
      node.removeEventListener("scroll", updatePosition);
      resizeObserver.disconnect();
    };
  }, [events.length, isSingle]);

  const scroll = (direction: number) => {
    const node = track.current;
    if (!node) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    node.scrollBy({
      left: direction * (cardStep.current || node.clientWidth),
      behavior,
    });
  };

  return (
    <section className="tl-events tl-section" aria-labelledby="tl-events-title">
      <div className="tl-events-heading" data-tl-reveal>
        <div>
          <p className="tl-kicker">At the club</p>
          <h2 id="tl-events-title">Events at Iloilo Golf and Country Club</h2>
        </div>
        {events.length > 1 && (
          <div className="tl-carousel-controls">
            <span aria-live="polite" ref={positionLabel}>
              1 <i>/</i> {events.length}
            </span>
            <button type="button" aria-label="Previous event" onClick={() => scroll(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next event" onClick={() => scroll(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {events.length ? (
        <div
          className={`tl-event-track${isSingle ? " is-single" : ""}`}
          data-tl-stagger
          ref={track}
          role={isSingle ? undefined : "region"}
          aria-label={isSingle ? undefined : "Tournament events"}
          tabIndex={isSingle ? undefined : 0}
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
        >
          {events.map((event, index) => (
            <article
              className={`tl-event-card${event.finished ? " is-finished" : ""}${isSingle ? " is-feature" : ""}${index === 0 ? " is-active" : ""}`}
              key={event.tournamentId}
              data-tl-reveal
            >
              <div className="tl-event-card-top">
                {!isSingle && (
                  <span className="tl-event-index">
                    {String(events.indexOf(event) + 1).padStart(2, "0")}
                  </span>
                )}
                <EventState event={event} />
              </div>
              <h3>{event.name}</h3>
              <p className="tl-card-date">{event.dateLabel}</p>
              <div className="tl-card-meta">
                <span>Iloilo Golf and Country Club</span>
                <span>{event.enteredLabel}</span>
              </div>
              {isSingle && (
                <dl className="tl-event-facts" data-tl-stagger>
                  <div>
                    <dt>Playing days</dt>
                    <dd>{event.dates.length}</dd>
                  </div>
                  <div>
                    <dt>Start format</dt>
                    <dd>{event.startFormat}</dd>
                  </div>
                  <div>
                    <dt>First tee</dt>
                    <dd>{event.firstTeeTime}</dd>
                  </div>
                </dl>
              )}
              <div className="tl-card-links">
                <Link className="tl-button tl-button-quiet" href="/pairings">
                  View published pairings
                </Link>
                <Link className="tl-button tl-button-quiet" href="/results/all">
                  See all scores
                </Link>
                {event.entriesOpen && (
                  <Link className="tl-button tl-button-light" href={`/enter/${event.tournamentId}`}>
                    Enter
                  </Link>
                )}
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
