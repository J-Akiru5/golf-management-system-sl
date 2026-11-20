/**
 * The landing page's event logic.
 *
 * Pure functions only. The page reads the clock once, on the server, and passes `today` in; every
 * date decision below is arithmetic on the ISO string, so the server render and the hydrated page
 * cannot disagree.
 */
import type {
  EventPhase,
  HeroStat,
  HeroView,
  LandingEvent,
  QuickAction,
} from "@/components/landing/types";
import {
  dateRange,
  daysBetween,
  enteredLabel,
  type PublicEvent,
  timeLabel,
  VENUE_LABEL,
} from "@/lib/public/highlights";

/**
 * Where the event stands today: before its first day, inside its own dates, or after its last.
 *
 * ISO dates compare as strings, so this needs no clock of its own: `today` is the Manila date the
 * page already read once.
 */
export function eventPhase(event: PublicEvent, today: string): EventPhase {
  const first = event.dates[0];
  const last = event.dates.at(-1);
  if (!first || !last) return "upcoming";
  if (today < first) return "upcoming";
  return today > last ? "past" : "live";
}

/**
 * Which playing day of the event today is, counting calendar days from the first tee. A rest day in
 * the middle of the week still gets a number rather than a zero.
 */
export function eventDayNumber(event: PublicEvent, today: string): number {
  const index = event.dates.indexOf(today);
  if (index >= 0) return index + 1;
  const first = event.dates[0];
  if (!first) return 1;
  return Math.min(Math.max(daysBetween(first, today) + 1, 1), event.dates.length);
}

function firstDate(event: PublicEvent): string {
  return event.dates[0] ?? "";
}

function lastDate(event: PublicEvent): string {
  return event.dates.at(-1) ?? "";
}

/** One event as the landing page shows it. Every value comes from the event itself. */
export function toLandingEvent(event: PublicEvent, today: string): LandingEvent {
  const phase = eventPhase(event, today);
  return {
    ...event,
    phase,
    finished: phase === "past",
    dayNumber: phase === "live" ? eventDayNumber(event, today) : 0,
    dateLabel: dateRange(event.dates),
    enteredLabel: enteredLabel(event.entered),
  };
}

function phaseRank(phase: EventPhase): number {
  if (phase === "live") return 0;
  if (phase === "upcoming") return 1;
  return 2;
}

/**
 * Live first, then upcoming by first date, then finished events newest first.
 *
 * The carousel reads left to right, so the order is the message: what is happening now, what is
 * next, then what just happened.
 */
export function orderForCarousel(events: readonly LandingEvent[]): LandingEvent[] {
  return [...events].sort((a, b) => {
    const rank = phaseRank(a.phase) - phaseRank(b.phase);
    if (rank !== 0) return rank;
    if (a.phase === "past") return lastDate(b).localeCompare(lastDate(a));
    return firstDate(a).localeCompare(firstDate(b));
  });
}

/** The live event; else the soonest upcoming; else the most recently finished; else null. */
export function pickFeatured(events: readonly LandingEvent[]): LandingEvent | null {
  const ordered = orderForCarousel(events);
  return ordered[0] ?? null;
}

/**
 * The side the hero opens on. An event is worth the front door while it is being played, or while
 * its first day is close enough that a visitor is likely to enter. Otherwise the page speaks to
 * clubs first. With no featured event there is no event side at all.
 */
export function defaultHeroView(featured: LandingEvent | null, today: string): HeroView {
  if (!featured) return "clubs";
  if (featured.phase === "live") return "event";
  if (featured.phase === "upcoming") {
    const days = daysBetween(today, firstDate(featured));
    if (days >= 0 && days <= 7) return "event";
  }
  return "clubs";
}

/**
 * The small line above the event title. "Live now · Day 2 of 4" says the one thing a player needs;
 * "Final results" and the two entry states name the moment without inventing one.
 */
export function eventEyebrow(featured: LandingEvent | null, today: string): string {
  if (!featured) return "";
  if (featured.phase === "live") {
    return `Live now · Day ${eventDayNumber(featured, today)} of ${featured.dates.length}`;
  }
  if (featured.phase === "past") return "Final results";
  return featured.entriesOpen ? "Open for entry now" : "Entries closed";
}

/**
 * The two or three things a visitor can do next, in the order the event's moment asks for them.
 * The primary action is the one that matches where the event is: a tee time while it is live, the
 * scores once it is over, the pairings before it starts.
 */
export function quickActionsFor(featured: LandingEvent | null): QuickAction[] {
  if (!featured) return [];
  if (featured.phase === "past") {
    return [
      { label: "See all scores", href: "/results/all", primary: true },
      { label: "View published pairings", href: "/pairings", primary: false },
    ];
  }
  if (featured.phase === "live") {
    return [
      { label: "Find my tee time", href: "/pairings", primary: true },
      { label: "See all scores", href: "/results/all", primary: false },
    ];
  }
  const actions: QuickAction[] = [
    { label: "View published pairings", href: "/pairings", primary: true },
    { label: "See all scores", href: "/results/all", primary: false },
  ];
  if (featured.entriesOpen) {
    actions.push({ label: "Enter", href: "/enter", primary: false });
  }
  return actions;
}

/** "12 Nov" from an ISO date. Formatted on the server, in UTC, so every browser agrees. */
function shortDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * The facts for the hero's stat row: entries, then either the cut-off (before play) or the first
 * tee (once play has started), the number of days and the venue.
 */
export function eventStatsFor(featured: LandingEvent | null, _today: string): HeroStat[] {
  if (!featured) return [];
  const stats: HeroStat[] = [{ label: "Entries", value: String(featured.entered) }];
  if (featured.phase === "upcoming") {
    stats.push({ label: "Cut-off", value: shortDate(featured.cutOffDate) });
  } else {
    stats.push({ label: "First tee", value: timeLabel(featured.firstTeeTime) });
  }
  stats.push({ label: "Days", value: String(featured.dates.length) });
  stats.push({ label: "Venue", value: VENUE_LABEL });
  return stats;
}
