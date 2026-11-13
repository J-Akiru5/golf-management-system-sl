/**
 * The public tournament tabs. Pairings, Players, Profile Players and Leaderboard each have a URL,
 * so a shared link opens the same tab and the back button works.
 */

export const PUBLIC_TABS = ["pairings", "players", "profile", "leaderboard", "scores"] as const;

export type PublicTab = (typeof PUBLIC_TABS)[number];

export interface PublicTabParams {
  player?: string | null;
  category?: string | null;
  flight?: string | null;
}

/** A query value may arrive once, several times, or not at all. */
export function parsePublicTab(value: string | string[] | undefined): PublicTab {
  const text = Array.isArray(value) ? value[0] : value;
  return (PUBLIC_TABS as readonly string[]).includes(text ?? "") ? (text as PublicTab) : "pairings";
}

/**
 * The canonical link for a tab. Pairings and Players have their own pages; the profile keeps the
 * pairings page and adds `?tab=profile`, which is the state the issue asks to preserve.
 */
export function publicTabHref(tab: PublicTab, params: PublicTabParams = {}): string {
  if (tab === "players") return "/roster";
  if (tab === "scores") return "/results";
  if (tab === "leaderboard") {
    const query = new URLSearchParams();
    if (params.category) query.set("category", params.category);
    if (params.flight) query.set("flight", params.flight);
    const suffix = query.toString();
    return suffix ? `/leaderboard?${suffix}` : "/leaderboard";
  }
  if (tab === "profile") {
    const query = new URLSearchParams({ tab: "profile" });
    if (params.player) query.set("player", params.player);
    return `/pairings?${query.toString()}`;
  }
  return "/pairings";
}
