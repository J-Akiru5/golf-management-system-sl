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
};

export type QuickAction = {
  label: string;
  href: string;
  /** One primary action per group, drawn as the light button. */
  primary: boolean;
};

/** Which side of the hero switch is showing. */
export type HeroView = "clubs" | "event";

export type HeroStat = { label: string; value: string };

export type LandingHeroProps = {
  /** The event the "Now hosting" side features, or null when there is none to show. */
  featured: LandingEvent | null;
  /** Small line above the event title, for example "Final results" or "Live now · Day 2 of 4". */
  eventEyebrow: string;
  /** For example See all scores, View published pairings. Empty when there is no featured event. */
  quickActions: QuickAction[];
  /** Event facts for the stat row: entries, first tee, days, venue. */
  eventStats: HeroStat[];
  /** The side the page opens on. The visitor can switch; with no featured event there is no switch. */
  defaultView: HeroView;
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
