/**
 * What goes in each phone bottom bar, and the rule for which item is current.
 *
 * The bar has room for four destinations plus an escape. It is not a smaller copy of the drawer:
 * it carries the work a person does while standing up, and the drawer keeps the rest.
 *
 * Desk (staff walking the course with a phone):
 *   Today        what needs attention now, before the next wave
 *   Draw         the live board is the reason to carry the phone
 *   Register     entries, withdrawals and changes on the day (the raised centre action)
 *   Players      find a member, their index and their contact number
 *   More         opens the existing drawer, so Print, Settings, Import, Course, Spotlight and
 *                Tournaments stay reachable without a second menu of their own
 *
 * Player (someone checking their own round):
 *   My golf      their entry and published start
 *   Pairings     the full published list
 *   Club home    the way back to the club's page
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
  | "home";

interface MobileItemBase {
  label: string;
  icon: MobileIcon;
  /** Stable target for the "Show me" tour and the browser harness. */
  testId: string;
}

export interface MobileLinkItem extends MobileItemBase {
  kind: "link";
  href: string;
  /** The raised centre action, drawn differently because it starts a task rather than a place. */
  action?: boolean;
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
 * My golf and Pairings are the benchmark's first two. The third is Club home, not Account: there
 * is no account screen today. Signing out sits in the player header and the claim step sits on
 * /my, so an Account tab would either duplicate My golf or open a page that does not exist.
 */
export const PLAYER_MOBILE_ITEMS: readonly MobileNavItem[] = [
  {
    kind: "link",
    href: "/my",
    label: "My golf",
    icon: "player",
    testId: "player-bar-my-golf",
  },
  {
    kind: "link",
    href: "/pairings",
    label: "Pairings",
    icon: "list",
    testId: "player-bar-pairings",
  },
  { kind: "link", href: "/", label: "Club home", icon: "home", testId: "player-bar-home" },
] as const;

/** The current page, including a detail page such as /players/abc. */
export function isMobileCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
