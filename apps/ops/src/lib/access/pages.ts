import type { WorkspaceRole } from "@/lib/db/types";

/**
 * Every page a person can be given access to, the three levels, and the role matrix that seeds
 * them. Pure data and pure functions: the nav, the route guard, the server actions and the tests all
 * read this file, so there is one place to add a page.
 *
 * A page is hidden at `none`, read only at `view`, and fully usable at `edit`. The database mirrors
 * this file in supabase/migrations/20261123000200_workspace_permissions.sql; a test compares the two
 * seeds so they cannot drift.
 */

export const ACCESS_LEVELS = ["none", "view", "edit"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  none: "No access",
  view: "View",
  edit: "Edit",
};

/** The icon the shell draws beside a page. The shell maps each one to a lucide icon. */
export type PageIcon = "overview" | "docs" | "board" | "tasks" | "timeline" | "settings" | "admin";

/** `workspace` pages live in this app. A desk page would be the same model with `desk`. */
export type PageApp = "workspace" | "desk";

export type AccessPage = {
  id: string;
  app: PageApp;
  label: string;
  /** The route this page owns. The longest matching prefix decides the page for a path. */
  route: string;
  icon: PageIcon;
  /** The levels this page understands. Every workspace page today takes all three. */
  levels: ReadonlyArray<AccessLevel>;
  /** True when the page is its own place in the menu. */
  nav: boolean;
  /** The menu word, when it differs from the page label (Settings holds three pages). */
  navLabel?: string;
};

export const PAGES = [
  {
    id: "overview",
    app: "workspace",
    label: "Overview",
    route: "/",
    icon: "overview",
    levels: ACCESS_LEVELS,
    nav: true,
  },
  {
    id: "documents",
    app: "workspace",
    label: "Documents",
    route: "/docs",
    icon: "docs",
    levels: ACCESS_LEVELS,
    nav: true,
  },
  {
    id: "pipeline",
    app: "workspace",
    label: "Pipeline",
    route: "/board",
    icon: "board",
    levels: ACCESS_LEVELS,
    nav: true,
  },
  {
    id: "tasks",
    app: "workspace",
    label: "Tasks",
    route: "/tasks",
    icon: "tasks",
    levels: ACCESS_LEVELS,
    nav: true,
  },
  {
    id: "timeline",
    app: "workspace",
    label: "Timeline",
    route: "/timeline",
    icon: "timeline",
    levels: ACCESS_LEVELS,
    nav: true,
  },
  {
    id: "settings.profile",
    app: "workspace",
    label: "Profile",
    route: "/settings",
    icon: "settings",
    levels: ACCESS_LEVELS,
    nav: true,
    navLabel: "Settings",
  },
  {
    id: "settings.members",
    app: "workspace",
    label: "Members",
    route: "/settings/members",
    icon: "settings",
    levels: ACCESS_LEVELS,
    nav: false,
  },
  {
    id: "settings.ai_providers",
    app: "workspace",
    label: "AI providers",
    route: "/settings/ai-providers",
    icon: "settings",
    levels: ACCESS_LEVELS,
    nav: false,
  },
  {
    id: "admin",
    app: "workspace",
    label: "Admin",
    route: "/admin",
    icon: "admin",
    levels: ACCESS_LEVELS,
    nav: true,
  },
] as const satisfies ReadonlyArray<AccessPage>;

export type PageId = (typeof PAGES)[number]["id"];

/** One registry entry, with its id narrowed to the union. */
export type RegistryPage = (typeof PAGES)[number];
export type WorkspacePage = RegistryPage & { app: "workspace" };

export const PAGE_IDS: ReadonlyArray<PageId> = PAGES.map((page) => page.id);

export function pageById(id: string): AccessPage | null {
  return PAGES.find((page) => page.id === id) ?? null;
}

export function isPageId(value: unknown): value is PageId {
  return typeof value === "string" && PAGES.some((page) => page.id === value);
}

export function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === "string" && (ACCESS_LEVELS as ReadonlyArray<string>).includes(value);
}

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

/** `true` when `level` is at least `needed`. */
export function levelAtLeast(level: AccessLevel, needed: AccessLevel): boolean {
  return RANK[level] >= RANK[needed];
}

/** The stronger of two levels. Used when two answers both apply. */
export function strongestLevel(left: AccessLevel, right: AccessLevel): AccessLevel {
  return RANK[left] >= RANK[right] ? left : right;
}

/** A page to level map. A page that is absent is `none`. */
export type AccessMap = Readonly<Record<string, AccessLevel | undefined>>;

/** The level a map gives a page, defaulting to none. */
export function levelFor(access: AccessMap, page: string): AccessLevel {
  return access[page] ?? "none";
}

/** A person's overrides, keyed by page. Only pages present here override the role default. */
export type AccessOverrides = Readonly<Record<string, AccessLevel | undefined>>;

/**
 * The role defaults the owner set on 21 Nov 2026. The owner cannot be lowered. These are the seed
 * in the migration and the fallback the app uses before the migration is applied.
 */
export const ROLE_DEFAULTS: Record<WorkspaceRole, Record<PageId, AccessLevel>> = {
  owner: {
    overview: "edit",
    documents: "edit",
    pipeline: "edit",
    tasks: "edit",
    timeline: "edit",
    "settings.profile": "edit",
    "settings.members": "edit",
    "settings.ai_providers": "edit",
    admin: "edit",
  },
  partner: {
    overview: "edit",
    documents: "edit",
    pipeline: "edit",
    tasks: "edit",
    timeline: "edit",
    "settings.profile": "edit",
    "settings.members": "view",
    "settings.ai_providers": "none",
    admin: "none",
  },
  member: {
    overview: "edit",
    documents: "edit",
    pipeline: "view",
    tasks: "edit",
    timeline: "view",
    "settings.profile": "edit",
    "settings.members": "none",
    "settings.ai_providers": "none",
    admin: "none",
  },
};

export const WORKSPACE_ROLES: ReadonlyArray<WorkspaceRole> = ["owner", "partner", "member"];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as ReadonlyArray<string>).includes(value);
}

/**
 * The one pure answer the whole app uses: an override wins over the role, the owner always has edit,
 * and a person with no role has nothing.
 */
export function effectiveAccess(
  role: WorkspaceRole | null,
  overrides: AccessOverrides,
  page: PageId,
): AccessLevel {
  if (role === "owner") return "edit";
  if (role === null) return "none";
  const override = overrides[page];
  if (override !== undefined) return override;
  return ROLE_DEFAULTS[role][page];
}

/** Every page at the role's default. This is the fallback before the migration is applied. */
export function roleAccess(role: WorkspaceRole | null): Record<string, AccessLevel> {
  const access: Record<string, AccessLevel> = {};
  for (const page of PAGES) access[page.id] = effectiveAccess(role, {}, page.id);
  return access;
}

/** Full access, for the demo owner. */
export function fullAccess(): Record<string, AccessLevel> {
  return roleAccess("owner");
}

/** Turn stored override rows into the map `effectiveAccess` takes. */
export function overridesByPage(
  rows: ReadonlyArray<{ page: string; level: AccessLevel }>,
): AccessOverrides {
  const overrides: Record<string, AccessLevel> = {};
  for (const row of rows) {
    if (isPageId(row.page) && isAccessLevel(row.level)) overrides[row.page] = row.level;
  }
  return overrides;
}

/**
 * Merge the database's answer with the role default, so a page the database did not mention keeps
 * the person's normal level instead of disappearing.
 */
export function mergeWithDefaults(
  role: WorkspaceRole,
  rows: ReadonlyArray<{ page: string; level: AccessLevel }>,
): Record<string, AccessLevel> {
  const access = roleAccess(role);
  for (const row of rows) {
    if (isPageId(row.page) && isAccessLevel(row.level)) access[row.page] = row.level;
  }
  return access;
}

/** The page a path belongs to, by longest route prefix. Null when nothing matches. */
export function pageForPath(pathname: string): PageId | null {
  let match: { page: PageId; length: number } | null = null;
  for (const page of PAGES) {
    const hit = page.route === "/" ? pathname === "/" : matchesRoute(pathname, page.route);
    if (!hit) continue;
    if (match === null || page.route.length > match.length) {
      match = { page: page.id, length: page.route.length };
    }
  }
  return match?.page ?? null;
}

/** True for the route itself and anything under it, so /docs/abc belongs to /docs. */
export function matchesRoute(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * The Settings tab that the menu should open. A person with no Profile access but with Members
 * access still needs a way in, so the first visible tab wins.
 */
export function firstSettingsPage(access: AccessMap): AccessPage | null {
  for (const page of PAGES) {
    if (page.app !== "workspace" || !page.route.startsWith("/settings")) continue;
    if (levelAtLeast(levelFor(access, page.id), "view")) return page;
  }
  return null;
}

export type NavItem = {
  href: string;
  label: string;
  icon: PageIcon;
};

/**
 * The menu for one person: an item appears only at view or edit. Nothing is greyed out; a page they
 * cannot open is simply absent. Settings appears when any of its three pages is visible and opens
 * the first one.
 */
export function navItemsFor(access: AccessMap): NavItem[] {
  const items: NavItem[] = [];
  for (const page of PAGES) {
    if (page.app !== "workspace" || !page.nav) continue;
    if (page.id === "settings.profile") {
      const target = firstSettingsPage(access);
      if (target === null) continue;
      items.push({
        href: target.route,
        label: page.navLabel ?? page.label,
        icon: page.icon,
      });
      continue;
    }
    if (!levelAtLeast(levelFor(access, page.id), "view")) continue;
    items.push({ href: page.route, label: page.label, icon: page.icon });
  }
  return items;
}

/** The Settings tabs this person may open, in registry order. */
export function settingsTabsFor(
  access: AccessMap,
): ReadonlyArray<{ page: PageId; href: string; label: string }> {
  const tabs: Array<{ page: PageId; href: string; label: string }> = [];
  for (const page of PAGES) {
    if (page.app !== "workspace" || !page.route.startsWith("/settings")) continue;
    if (!levelAtLeast(levelFor(access, page.id), "view")) continue;
    tabs.push({ page: page.id, href: page.route, label: page.label });
  }
  return tabs;
}

/** Every page in one place, for the matrix and the person sheet. */
export function workspacePages(): ReadonlyArray<WorkspacePage> {
  return PAGES.filter((page): page is WorkspacePage => page.app === "workspace");
}

/** The title for the top bar: the menu entry that covers the path. */
export function navTitle(pathname: string): string {
  let match: AccessPage | null = null;
  for (const page of PAGES) {
    if (page.app !== "workspace" || !page.nav) continue;
    if (!matchesRoute(pathname, page.route)) continue;
    if (match === null || page.route.length > match.route.length) match = page;
  }
  if (match === null) return "Workspace";
  return match.navLabel ?? match.label;
}
