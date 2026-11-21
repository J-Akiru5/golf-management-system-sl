import {
  type AccessMap,
  type NavItem,
  navItemsFor as navItemsForAccess,
  navTitle,
  type PageIcon,
} from "@/lib/access/pages";

/**
 * The menu is built from the page registry in lib/access/pages, filtered by the person's effective
 * access. An item is shown only at view or edit; anything else is hidden, never greyed out. Pure,
 * so the rule is tested without a browser.
 */

export type NavIcon = PageIcon;
export type { NavItem };

/** The menu for one person. */
export function navItemsFor(access: AccessMap): NavItem[] {
  return navItemsForAccess(access);
}

/** "/" is exact; every other item also covers its children, so /docs/123 keeps Documents lit. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The title for the top bar. A path outside the menu, such as /login, keeps the app name. */
export function pageTitle(pathname: string): string {
  return navTitle(pathname);
}
