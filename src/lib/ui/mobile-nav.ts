import type { TranslationKey } from "@/lib/i18n/t";

/**
 * What goes in each phone bottom bar, and the rule for which item is current.
 * The bar has room for four destinations plus an escape. It is not a smaller copy of the drawer:
 * it carries the work a person does while standing up, and the drawer keeps the rest.
 *
 * Desk (staff walking the course with a phone):
 *   Today        what needs attention now, before the next start
 *   Draw         the live board is the reason to carry the phone
 *   Register     entries, withdrawals and changes on the day (the raised centre action)
 *   Players      find a member, their index and their contact number
 *   More         opens the existing drawer, so Print, Settings, Import, Course, Spotlight and
 *                Tournaments stay reachable without a second menu of their own
 *
 * Player (someone checking their own round):
 *   Home         their entry and published start
 *   Board        the live leaderboard, with their own row marked
 *   Card         the scorecards the club has published
 *   Pairings     the full published list
 *   Profile      the record the club holds for them
 *
 * Test ids are part of the contract with the "Show me" feature: it navigates to a page and rings
 * one of these controls, so they must not be renamed casually. Labels stay visible; an icon-only
 * bar is a guess, and the club's stewards are not all phone-native.
 */

export type MobileIcon =
  | "grid"
  | "flag"
  | "clipboard"
  | "users"
  | "printer"
  | "menu"
  | "player"
  | "list"
  | "home"
  | "trophy";

interface MobileItemBase {
  label: string;
  icon: MobileIcon;
  /** Stable target for the "Show me" tour and the browser harness. */
  testId: string;
  /** Player items are translated; the desk stays English (decision 18). */
  labelKey?: TranslationKey;
}

export interface MobileLinkItem extends MobileItemBase {
  kind: "link";
  href: string;
  /** The raised centre action, drawn differently because it starts a task rather than a place. */
  action?: boolean;
  /**
   * Matches this path only, not its children. Home needs it: /my is the parent of every player
   * screen, so without it Home and whichever destination the player opened would both be current.
   */
  exact?: boolean;
}

export interface MobileMoreItem extends MobileItemBase {
  kind: "more";
}

export type MobileNavItem = MobileLinkItem | MobileMoreItem;

/**
 * The benchmark (docs/mobile-benchmark.md) found four destinations plus one action to be the
 * common shape, with a catch-all. The desk bar follows that: Today first, the live draw, the
 * register desk as the raised centre action, the player directory, and More.
 *
 * Register is a destination to /register rather than the benchmark's action sheet: the three
 * things that sheet would do (check in, add a walk-up, withdraw) all live on that screen today,
 * and this issue must point at screens that already exist. Print was left out on the benchmark's
 * advice: A4 output is a desk job, not a phone task, so it stays in More.
 */
export const DESK_MOBILE_ITEMS: readonly MobileNavItem[] = [
  { kind: "link", href: "/admin", label: "Today", icon: "grid", testId: "desk-bar-today" },
  { kind: "link", href: "/draw", label: "Draw", icon: "flag", testId: "desk-bar-draw" },
  {
    kind: "link",
    href: "/register",
    label: "Register",
    icon: "clipboard",
    testId: "desk-bar-register",
    action: true,
  },
  { kind: "link", href: "/players", label: "Players", icon: "users", testId: "desk-bar-players" },
  { kind: "more", label: "More", icon: "menu", testId: "desk-bar-more" },
] as const;

/**
 * The player app's four destinations. The scorecard lives in the home hero's quick actions
 * instead of taking a tab: four labels stay readable on a 360px phone, and the card is one tap
 * from the start time it belongs to.
 */
export const PLAYER_MOBILE_ITEMS: readonly MobileNavItem[] = [
  {
    kind: "link",
    href: "/my",
    label: "Home",
    labelKey: "player.tab.home",
    icon: "home",
    testId: "player-bar-home",
    exact: true,
  },
  {
    kind: "link",
    href: "/pairings",
    label: "Pairings",
    labelKey: "player.tab.pairings",
    icon: "list",
    testId: "player-bar-pairings",
  },
  {
    // The signed-in live board, with the player's own row marked. The public bar carries the
    // published leaderboard for readers who are not signed in; this one is for a player.
    kind: "link",
    href: "/my/board",
    label: "Board",
    labelKey: "player.tab.board",
    icon: "trophy",
    testId: "player-bar-board",
  },
  {
    kind: "link",
    href: "/my/profile",
    label: "Me",
    labelKey: "player.tab.me",
    icon: "player",
    testId: "player-bar-profile",
  },
] as const;

/**
 * The bar on the public pages, for people who are not signed in. It is a different bar with a
 * different promise: every destination is open, and the first tab is the way back to the club's
 * front door. The signed-in bar's Home points at /my, which is a login wall for these readers;
 * that is why this set exists instead of reusing the player one.
 *
 *   Club home  the landing page, always one tap away
 *   Pairings    the published groups
 *   Players     the published field
 *   Board       the public leaderboard
 */
export const PUBLIC_MOBILE_ITEMS: readonly MobileNavItem[] = [
  {
    kind: "link",
    href: "/",
    label: "Club home",
    labelKey: "auth.clubHome",
    icon: "home",
    testId: "public-bar-home",
    exact: true,
  },
  {
    kind: "link",
    href: "/pairings",
    label: "Pairings",
    labelKey: "player.tab.pairings",
    icon: "list",
    testId: "public-bar-pairings",
  },
  {
    kind: "link",
    href: "/roster",
    label: "Players",
    labelKey: "programme.playersTitle",
    icon: "users",
    testId: "public-bar-players",
  },
  {
    kind: "link",
    href: "/leaderboard",
    label: "Board",
    labelKey: "player.tab.board",
    icon: "trophy",
    testId: "public-bar-board",
  },
] as const;

/** The current page, including a detail page such as /players/abc. */
export function isMobileCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
