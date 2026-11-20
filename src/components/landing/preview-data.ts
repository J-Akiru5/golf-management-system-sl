import type { EventCarouselProps, LandingHeroProps, ProductShot, ProofStripProps } from "./types";

/** Sample-only props for the design preview and static-render tests. */
export const previewHero: LandingHeroProps = {
  featured: {
    tournamentId: "preview-bamboo-tee-2026",
    name: "24th Bamboo Tee",
    dates: ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
    startFormat: "shotgun",
    firstTeeTime: "06:00",
    cutOffDate: "2026-10-22",
    entered: 327,
    entriesOpen: false,
    phase: "past",
    finished: true,
    dayNumber: 0,
    dateLabel: "Nov 12–15, 2026",
    enteredLabel: "327 entered",
  },
  eventEyebrow: "Final results",
  quickActions: [
    { label: "See all scores", href: "/results/all", primary: true },
    { label: "View published pairings", href: "/pairings", primary: false },
  ],
  eventStats: [
    { label: "Entries", value: "327" },
    { label: "First tee", value: "6:00 AM" },
    { label: "Days", value: "4" },
    { label: "Venue", value: "Iloilo Golf and Country Club" },
  ],
  defaultView: "event",
};

export const previewEvents: EventCarouselProps["events"] = [previewHero.featured!];

export const previewShots: ProductShot[] = [
  {
    src: "/landing/control-room.webp",
    alt: "Illustrated tournament control room with a course overview, field summary and event controls",
    caption: "One view of the tournament desk",
    width: 1884,
    height: 930,
  },
  {
    src: "/landing/hole-overview.webp",
    alt: "Hole overview screen with a course illustration and distance markers",
    caption: "Course and hole overview",
    width: 1500,
    height: 932,
  },
  {
    src: "/landing/scorecard-entry.webp",
    alt: "Hole-by-hole score entry table",
    caption: "Hole-by-hole score entry",
    width: 1884,
    height: 490,
  },
];

export const previewProof: ProofStripProps = {
  stats: [
    { value: "327", label: "entries", detail: "Confirmed field for the event" },
    { value: "4", label: "playing days", detail: "Nov 12–15, 2026" },
    { value: "6:00", label: "first tee", detail: "AM start" },
    { value: "IGCC", label: "venue", detail: "Iloilo Golf and Country Club" },
  ],
  source: "Sample figures for visual review · 24th Bamboo Tee, Nov 12–15, 2026",
};
