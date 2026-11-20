/**
 * The contract between the landing page's data (src/lib/public/showcase.ts, the page) and its visual
 * components (src/components/landing/*). Both sides build against these types. Change them only
 * through the orchestrator.
 */
import type { PublicEvent } from "@/lib/public/highlights";

export type EventPhase = "upcoming" | "live" | "past";

/** An event as the landing page shows it. Every value comes from the database, none is invented. */
export type LandingEvent = PublicEvent & {
  phase: EventPhase;
  /** True once the last playing day has passed. Shown as "Completed". */
  finished: boolean;
  /** 1-based day of the event today, or 0 when the event is not being played today. */
  dayNumber: number;
  /** Ready to print, for example "Nov 12–15, 2026". Formatted on the server. */
  dateLabel: string;
  /** For example "327 entered". */
  enteredLabel: string;
  /**
   * True only when an organizer switched "Feature on the home page" on for this event in the desk.
   * The landing page never picks a featured event by itself.
   */
  featured: boolean;
};

export type QuickAction = {
  label: string;
  href: string;
  /** One primary action per group, drawn as the light button. */
  primary: boolean;
};

export type HeroStat = { label: string; value: string };

/**
 * The hero speaks to clubs. There is no visitor-facing switch: whether an event is featured is an
 * organizer's decision in the desk (Setup, "TeeLine home page"). When one is featured, the hero shows
 * a "Now hosting" pill and a featured-event band with its quick actions; when none is, neither renders.
 */
export type LandingHeroProps = {
  /** The event an organizer chose to feature, or null. */
  featured: LandingEvent | null;
  /** Small line above the event title, for example "Final results" or "Live now · Day 2 of 4". */
  eventEyebrow: string;
  /** For example See all scores, View published pairings. Empty when there is no featured event. */
  quickActions: QuickAction[];
  /** Event facts for the stat row: entries, first tee, days, venue. */
  eventStats: HeroStat[];
  /** The first product screenshot, shown rising into the hero's lower edge. */
  heroShot: ProductShot | null;
};

export type ProductShot = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

export type ProofStat = {
  /** As printed, for example "118,279". */
  value: string;
  label: string;
  detail: string;
};

export type ProofStripProps = {
  stats: ProofStat[];
  /** One line naming where the numbers come from. */
  source: string;
};

export type EventCarouselProps = {
  /** Live first, then upcoming, then finished events newest first. */
  events: LandingEvent[];
};

export type LandingFooterProps = {
  versionLabel: string;
};
