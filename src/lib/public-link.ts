/**
 * The public entry link for an event.
 *
 * The desk often runs on localhost while the players are on the deployed domain, so the current
 * origin is only the development fallback: `NEXT_PUBLIC_SITE_URL` is the deployed address and wins
 * whenever it is set. The bug this fixes: a link copied from localhost was sent to players.
 */

/** The route a player opens to enter the event. */
export function entryPath(tournamentId: string): string {
  return `/enter/${encodeURIComponent(tournamentId)}`;
}

/** The full link: the configured site URL first, the browser's origin only as a fallback. */
export function entryUrl(input: {
  tournamentId: string;
  siteUrl?: string;
  origin?: string;
}): string {
  const site = (input.siteUrl ?? "").trim().replace(/\/+$/, "");
  const path = entryPath(input.tournamentId);
  if (site) return `${site}${path}`;
  const origin = (input.origin ?? "").trim().replace(/\/+$/, "");
  return `${origin}${path}`;
}

/** The site URL baked into the build, when one is configured. */
export const configuredSiteUrl = (): string | undefined =>
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || undefined;
