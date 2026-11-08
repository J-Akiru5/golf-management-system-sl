/**
 * Whether a page was opened from the public pairings view.
 *
 * The Rules page is reachable from several places. When it was opened from `/pairings` (including
 * `?tab=profile`), its back link should return to the pairings page rather than the main page. A
 * foreign referrer that happens to end in `/pairings` must not count, so the origin is checked too.
 */
export function isPairingsReferrer(referrer: string | null | undefined, origin: string): boolean {
  if (!referrer) return false;
  try {
    const url = new URL(referrer);
    return (
      url.origin === origin &&
      (url.pathname === "/pairings" || url.pathname.startsWith("/pairings/"))
    );
  } catch {
    return false;
  }
}

/**
 * Whether a page should treat the pairings view as its way back.
 *
 * The explicit `?from=pairings` marker is the reliable signal: Next.js client navigation does not
 * send a new document request, so `document.referrer` can be empty. The referrer remains a fallback
 * for a full page load.
 */
export function isPairingsBack(
  search: string,
  referrer: string | null | undefined,
  origin: string,
): boolean {
  return (
    new URLSearchParams(search).get("from") === "pairings" || isPairingsReferrer(referrer, origin)
  );
}
