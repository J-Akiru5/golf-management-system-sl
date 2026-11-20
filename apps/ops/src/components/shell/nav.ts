/**
 * The five places in the workspace. Order is the order on screen. Pure data, so the list and the
 * active-state rule can be tested without a browser.
 */
export type NavIcon = "overview" | "docs" | "board" | "tasks" | "settings";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
};

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/docs", label: "Documents", icon: "docs" },
  { href: "/board", label: "Pipeline", icon: "board" },
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

/** "/" is exact; every other item also covers its children, so /docs/123 keeps Documents lit. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The title for the top bar. A path outside the five, such as /login, keeps the app name. */
export function pageTitle(pathname: string): string {
  const item = NAV_ITEMS.find((candidate) => isActive(pathname, candidate.href));
  return item?.label ?? "Workspace";
}
