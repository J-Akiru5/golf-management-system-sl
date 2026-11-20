/**
 * The published figures and product shots on the landing page.
 *
 * Every number below is from the owner's analytics report for the 24th Bamboo Tee. They are copied
 * as printed: no rounding, no derived totals, nothing added. A landing page that invents a figure is
 * worse than one with a shorter proof strip.
 */
import type { ProductShot, ProofStat } from "@/components/landing/types";

export const PROOF_SOURCE =
  "24th Bamboo Tee, Iloilo Golf and Country Club, 12 to 15 Nov 2026. Platform analytics by Syntaxure Labs.";

export const PROOF_STATS: ProofStat[] = [
  {
    value: "327",
    label: "entries",
    detail: "recorded on the live site for the 24th Bamboo Tee",
  },
  {
    value: "118,279",
    label: "live requests",
    detail: "in the 25-hour peak window, 14 to 15 Nov 2026",
  },
  {
    value: "17,403",
    label: "in the busiest hour",
    detail: "pairings, scorecards and leaderboard at once",
  },
  {
    value: "20,641",
    label: "public scorecard views",
    detail: "players and guests following live scorecards on their phones",
  },
  {
    value: "0",
    label: "downtime",
    detail: "the site stayed up through the whole tournament",
  },
];

export const PRODUCT_SHOTS: ProductShot[] = [
  {
    src: "/landing/control-room.webp",
    alt: "The control room screen: the draw, the field and the items to fix before publishing.",
    caption:
      "Control room: the draw, the field and what must be fixed before publishing, on one screen.",
    width: 1883,
    height: 931,
  },
  {
    src: "/landing/hole-overview.webp",
    alt: "The course and holes screen: each start hole with its groups and distances.",
    caption: "Course and holes: every start hole, with its groups and distances.",
    width: 1500,
    height: 932,
  },
  {
    src: "/landing/scorecard-entry.webp",
    alt: "The score entry screen: a hole-by-hole card checked against the paper card.",
    caption: "Score entry: hole by hole, checked against the paper card.",
    width: 1891,
    height: 491,
  },
];
