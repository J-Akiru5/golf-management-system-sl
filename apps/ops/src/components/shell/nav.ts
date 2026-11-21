/**
 * The places in the workspace. Order is the order on screen. Pure data, so the list and the
 * active-state rule can be tested without a browser. Admin is shown to workspace owners only; the
 * page itself still refuses everyone else.
 */
export type NavIcon = "overview" | "docs" | "board" | "tasks" | "settings" | "admin";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  ownerOnly?: boolean;
};

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/docs", label: "Documents", icon: "docs" },
  { href: "/board", label: "Pipeline", icon: "board" },
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: "admin",
  ownerOnly: true,
};

/** The menu for this viewer. The owner gets Admin last. */
export function navItemsFor(isOwner: boolean): NavItem[] {
  return isOwner ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : [...NAV_ITEMS];
}

/** "/" is exact; every other item also covers its children, so /docs/123 keeps Documents lit. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The title for the top bar. A path outside the menu, such as /login, keeps the app name. */
export function pageTitle(pathname: string): string {
  const item = [...NAV_ITEMS, ADMIN_NAV_ITEM].find((candidate) =>
    isActive(pathname, candidate.href),
  );
  return item?.label ?? "Workspace";
}
