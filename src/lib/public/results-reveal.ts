import type { PublicReleaseState } from "@/lib/data/public";

/**
 * The results blackout and its reveal.
 *
 * The awarding on the last day needs the public pages to stop showing scores and players while the
 * room is being set up, and then to come back together at a moment the organizer chooses. The hold
 * itself is the existing `leaderboard` and `roster` release keys, enforced in the database, so this
 * module only decides what a page *says* while the hold is on: the holding screen, a countdown to
 * the stored reveal time, or the results once the database has released them.
 *
 * Pure: no clock of its own, no network, no React. Every function takes the values it needs, so the
 * countdown, the phases and the polling interval are tested without a browser.
 */

/** The two release keys the blackout turns off. Pairings, tee times and rules stay open. */
export const BLACKOUT_SURFACES = ["leaderboard", "roster"] as const;

export type BlackoutSurface = (typeof BLACKOUT_SURFACES)[number];

/** The blackout keys, as released (`true`) or held (`false`). */
export type BlackoutFlags = Record<BlackoutSurface, boolean>;

/** The key inside `tournaments.publish_views` that holds the reveal time. */
export const REVEAL_KEY = "resultsRevealAt";

export const REVEAL_MIN_SECONDS = 1;
export const REVEAL_MAX_SECONDS = 600;
export const REVEAL_DEFAULT_SECONDS = 15;

/** The countdown switches to a 2-3 second poll for the last half minute. */
export const NEAR_END_MS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A meaningful ISO timestamp, or null. A stored value that is not one is ignored, never guessed. */
export function parseRevealAt(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** The reveal time stored inside a `publish_views` object, or null when there is none. */
export function storedRevealAt(publishViews: unknown): string | null {
  if (!isRecord(publishViews)) return null;
  return parseRevealAt(publishViews[REVEAL_KEY]);
}

/**
 * The `publish_views` object with the reveal key set, cleared, or added. Other keys are copied as
 * they are, including keys this build does not know, so writing the reveal time never turns a
 * released surface back on or drops a policy another page wrote.
 */
export function mergeRevealKey(
  publishViews: unknown,
  revealAt: string | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(publishViews) ? { ...publishViews } : {};
  const parsed = parseRevealAt(revealAt);
  if (parsed) next[REVEAL_KEY] = parsed;
  else delete next[REVEAL_KEY];
  return next;
}

/** The number of seconds a reveal starts in, clamped to 1-600. Anything unusable is the default. */
export function revealSeconds(input: unknown): number {
  const value =
    typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : Number.NaN;
  if (!Number.isFinite(value)) return REVEAL_DEFAULT_SECONDS;
  return Math.min(REVEAL_MAX_SECONDS, Math.max(REVEAL_MIN_SECONDS, Math.round(value)));
}

/** The reveal time: the organizer's clock plus the chosen seconds, as an ISO timestamp. */
export function revealAtFromSeconds(seconds: number, nowMs: number): string {
  return new Date(nowMs + revealSeconds(seconds) * 1000).toISOString();
}

/** True when the deadline has arrived according to the clock given. */
export function revealIsDue(revealAt: string | null, nowMs: number): boolean {
  const parsed = parseRevealAt(revealAt);
  return parsed !== null && Date.parse(parsed) <= nowMs;
}

/** True while the desk is holding at least one of the surfaces this page shows. */
export function blackoutHeld(
  state: Pick<PublicReleaseState, BlackoutSurface> | null | undefined,
  surfaces: readonly BlackoutSurface[] = BLACKOUT_SURFACES,
): boolean {
  if (!state) return false;
  return surfaces.some((surface) => state[surface] === false);
}

/** The blackout keys as held flags, for a signature the server render and the poll both build. */
export function blackoutFlags(
  state: Pick<PublicReleaseState, BlackoutSurface> | null | undefined,
): BlackoutFlags {
  return {
    leaderboard: state ? state.leaderboard === false : false,
    roster: state ? state.roster === false : false,
  };
}

/**
 * What the page should say.
 *
 * - `revealed`: the database has released the results; show them.
 * - `hidden`: held, with no reveal time. The calm holding screen, no countdown.
 * - `counting`: held, with a reveal time still to come.
 * - `due`: the reveal time has passed but the database still holds the results (the organizer's
 *   browser was closed, say). The screen stays hidden: the database is the gate, never this clock.
 */
export type RevealPhase = "revealed" | "hidden" | "counting" | "due";

export function revealPhase({
  held,
  remainingMs,
}: {
  held: boolean;
  remainingMs: number | null;
}): RevealPhase {
  if (!held) return "revealed";
  if (remainingMs === null) return "hidden";
  return remainingMs > 0 ? "counting" : "due";
}

/**
 * How long is left, measured from the server's clock rather than the device's.
 *
 * Phone clocks drift, and the person reading the screen may have set theirs by hand. The server
 * says what time it is at render; the browser only measures how long it has been since that render
 * arrived. A device whose clock is hours off therefore still shows the right remaining time, and a
 * countdown that starts a few seconds late (a slow network) is a few seconds late, not wrong.
 */
export function revealRemainingMs({
  revealAt,
  serverNow,
  receivedAt,
  now,
}: {
  revealAt: string | null;
  serverNow: string | number;
  receivedAt: number;
  now: number;
}): number | null {
  const parsed = parseRevealAt(revealAt);
  if (parsed === null) return null;
  const serverMs = typeof serverNow === "number" ? serverNow : Date.parse(serverNow);
  if (!Number.isFinite(serverMs)) return null;
  const elapsed = Math.max(0, now - receivedAt);
  return Math.max(0, Date.parse(parsed) - (serverMs + elapsed));
}

/** `0:15`, `1:05`, `10:00`. Whole seconds, rounding up so the last second is shown, not skipped. */
export function formatCountdown(remainingMs: number | null): string {
  if (remainingMs === null) return "";
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * How often the holding screen asks whether the reveal has happened. Five seconds is enough while
 * nothing is imminent; the last half minute asks every 2.5 seconds so the results appear with the
 * countdown, not up to five seconds after it.
 */
export function revealPollBaseMs(remainingMs: number | null): number {
  if (remainingMs !== null && remainingMs <= NEAR_END_MS) return 2_500;
  return 5_000;
}

/** What identifies the hold a page is showing: both keys plus the reveal time. */
export function revealSignature(held: BlackoutFlags, revealAt: string | null): string {
  const flags = BLACKOUT_SURFACES.map((surface) => (held[surface] ? "1" : "0")).join("");
  return `${flags}|${parseRevealAt(revealAt) ?? "-"}`;
}

/** The body `/api/results/reveal` answers with: both blackout keys and the reveal time. */
export interface RevealPoll {
  held: BlackoutFlags;
  revealAt: string | null;
}

/** Validates the poll's answer. A malformed body is a failed check, never a release. */
export function parseRevealPoll(value: unknown): RevealPoll | null {
  if (!isRecord(value) || !isRecord(value.held)) return null;
  const held = value.held;
  if (typeof held.leaderboard !== "boolean" || typeof held.roster !== "boolean") return null;
  return {
    held: { leaderboard: held.leaderboard, roster: held.roster },
    revealAt: parseRevealAt(value.revealAt),
  };
}
