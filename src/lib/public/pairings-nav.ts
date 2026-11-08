import type { PublicTab } from "@/lib/data/public-tabs";

export interface PairingsBackTarget {
  labelKey: "pairings.backHome" | "pairings.backToPairings";
  href: "/" | "/pairings";
}

/**
 * The top link on the public pairings page (issue 207).
 *
 * A player's profile is a view inside `/pairings`, so its way back is the pairings list. Every other
 * tab is a top-level public page and returns to the main page. The live page and the demo use the
 * same rule so they cannot drift.
 */
export function pairingsBackLink(tab: PublicTab | null | undefined): PairingsBackTarget {
  return tab === "profile"
    ? { labelKey: "pairings.backToPairings", href: "/pairings" }
    : { labelKey: "pairings.backHome", href: "/" };
}
