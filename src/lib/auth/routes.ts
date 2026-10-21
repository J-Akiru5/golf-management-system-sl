/**
 * Which part of the site a path belongs to, and where each kind of account may go.
 *
 * These are pure functions on purpose: the proxy and the sign-in action both call them, and the
 * rules are covered by `routes.test.ts` instead of being discovered by clicking around.
 *
 * Three areas:
 *   public  the marketing page, the published pairings, the entry form, sign-in itself
 *   player  /my, the signed-in player's own entry and start
 *   staff   the tournament desk
 */

export type Area = "public" | "player" | "staff";

/** The desk. Every path here needs a club_members row. */
export const STAFF_PREFIXES = [
  "/admin",
  "/tournaments",
  "/register",
  "/players",
  "/import",
  "/draw",
  "/scores",
  "/print",
  "/setup",
  "/course",
  "/spotlight",
] as const;

/** The player area. Needs a signed-in account; the record link is handled on the page. */
export const PLAYER_PREFIXES = ["/my"] as const;

/** What the proxy matches. Public pages are not listed, so they never pay for a session lookup. */
export const PROXY_MATCHER: string[] = [
  "/login",
  "/auth/:path*",
  ...PLAYER_PREFIXES.map((prefix) => `${prefix}/:path*`),
  ...STAFF_PREFIXES.map((prefix) => `${prefix}/:path*`),
];

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function areaOf(pathname: string): Area {
  // Dev-only previews live under (desk) but are not staff pages; they 404 in a production build.
  if (PLAYER_PREFIXES.some((prefix) => matches(pathname, prefix))) return "player";
  if (STAFF_PREFIXES.some((prefix) => matches(pathname, prefix))) return "staff";
  return "public";
}

/**
 * Who is asking.
 *   signed-out  no session
 *   staff       a club_members row (owner, organizer or desk)
 *   player      a linked players row, no club membership
 *   unlinked    signed in, but neither of the above
 */
export type Identity = "signed-out" | "staff" | "player" | "unlinked";

export type Decision = { type: "allow" } | { type: "redirect"; to: string; error?: string };

const loginFor = (pathname: string, search: string): Decision => {
  const next = `${pathname}${search}`;
  return {
    type: "redirect",
    to: `/login?next=${encodeURIComponent(next)}&error=sign_in_required`,
  };
};

/**
 * The single decision point for a request. `search` is the query string, used to return the
 * visitor to where they were after signing in; `next` is the target a sign-in link asked for.
 */
export function decide(input: {
  pathname: string;
  search?: string;
  next?: string | null;
  identity: Identity;
}): Decision {
  const { pathname, identity } = input;
  const search = input.search ?? "";

  if (pathname === "/login") {
    if (identity === "signed-out") return { type: "allow" };
    return { type: "redirect", to: landingFor({ next: input.next ?? null, identity }) };
  }

  const area = areaOf(pathname);

  if (area === "public") return { type: "allow" };

  if (identity === "signed-out") return loginFor(pathname, search);

  if (area === "staff" && identity !== "staff") {
    // A player or an unlinked account asking for the desk: send them where they belong.
    return { type: "redirect", to: "/my" };
  }

  return { type: "allow" };
}

/**
 * Where an account goes after signing in (or when it opens /login while already signed in).
 * `next` is honoured only when that area is open to the account; otherwise each area has a home.
 */
export function landingFor(input: { next?: string | null; identity: Identity }): string {
  const { identity } = input;
  const next = input.next?.trim() ?? "";
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "";
  const area = safe === "" ? "public" : areaOf(safe.split("?")[0] ?? safe);

  if (identity === "staff") {
    return safe !== "" && area === "staff" ? safe : "/admin";
  }

  // Players and unlinked accounts may land on a public page they asked for, never on the desk.
  return safe !== "" && area !== "staff" ? safe : "/my";
}
