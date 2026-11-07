/**
 * The staff app's four destinations.
 *
 * Four, not eleven: a volunteer holding a phone in the sun gets Today, the players, the day's
 * schedule and the group they are scoring. Everything the organizer desk can do stays on the desk,
 * one link away in the header for a manager.
 *
 * Test ids are stable like the desk bar's: the browser harness and the "Show me" tour point at them.
 */

export type StaffIcon = "home" | "users" | "flag" | "clipboard";

export interface StaffNavItem {
  href: string;
  label: string;
  icon: StaffIcon;
  testId: string;
  /** Matches this path only, so Today is not also current inside Players. */
  exact?: boolean;
}

export const STAFF_NAV: readonly StaffNavItem[] = [
  { href: "/staff", label: "Today", icon: "home", testId: "staff-bar-today", exact: true },
  { href: "/staff/players", label: "Players", icon: "users", testId: "staff-bar-players" },
  { href: "/staff/schedule", label: "Schedule", icon: "flag", testId: "staff-bar-schedule" },
  { href: "/staff/score", label: "Score", icon: "clipboard", testId: "staff-bar-score" },
] as const;

/** The current destination, including its detail pages. */
export function isStaffCurrent(pathname: string, item: StaffNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
