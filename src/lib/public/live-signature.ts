import type { PublicReleaseState } from "@/lib/data/public";
import type { PublicRoundSummary } from "@/lib/data/public-results";
import { pairingsSignature } from "@/lib/public/pairings-live";

/**
 * What identifies everything a public page can show, as one short string.
 *
 * The public pages poll `/api/revalidate-pairings` (GET) while the tab is visible and reload only
 * when this string has moved. It covers the two moments that change what players see:
 *
 *   - a pairings publish or unpublish, and a release toggle, through `pairingsSignature`;
 *   - a round publish or finalize, through one line per published round.
 *
 * Scores and handicaps the desk has saved but not published are deliberately absent: players only
 * ever see the frozen publication, so a save that is not a publish must not reload their page.
 *
 * Pure: no database, no network. `readPublicLiveSignature` in `public-cache` supplies the parts.
 */

/** One line per published round: the version and time that made it public. */
export function resultsSignature(rounds: readonly PublicRoundSummary[]): string {
  if (rounds.length === 0) return "none";
  return [...rounds]
    .sort((left, right) => left.roundId.localeCompare(right.roundId))
    .map((round) => `${round.roundId}:v${round.version}:${round.state}@${round.publishedAt}`)
    .join(",");
}

/** What a page renders: the pairings signature and the results signature, in one string. */
export function liveSignature(input: {
  published: { at: string; version?: number | null } | null | undefined;
  release: PublicReleaseState | null;
  results: string;
}): string {
  return `pairings:${pairingsSignature(input.published, input.release)};results:${input.results}`;
}

/**
 * How long a visible public page waits between checks. Short enough that a publish is on screen in
 * the time it takes to walk from the desk to the board, long enough that a phone in a pocket while
 * the tab is hidden asks nothing at all. The endpoint is edge-cached for a few seconds, so a field
 * of phones does not turn into a field of database reads.
 */
export const PUBLIC_LIVE_POLL_MS = 10_000;
/** The longest wait between checks while the endpoint keeps failing. */
export const PUBLIC_LIVE_MAX_MS = 120_000;
