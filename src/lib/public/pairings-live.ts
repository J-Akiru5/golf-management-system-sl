import type { PublicReleaseState } from "@/lib/data/public";

/**
 * Keeps the public pairings page current without anyone pressing refresh.
 *
 * The page only ever shows the frozen published snapshot, never the organizers' live board, so the
 * moment worth reacting to is a publish or an unpublish, not every draft edit. Each publish has a
 * version and a time; this module turns that into a signature, polls a cheap endpoint for it, and
 * tells the page to reload when it changes.
 *
 * Pure: no DOM, no React, no network of its own. The caller hands in the fetch, the clock and the
 * browser's visibility and connectivity, so the timing rules are tested without a browser.
 */

/** How often a visible, online page asks whether there is a new version. */
export const POLL_MS = 30_000;
/** The longest wait between asks while the endpoint keeps failing. */
export const MAX_BACKOFF_MS = 300_000;
/** A tab that flickers visible and hidden must not turn into a request per flicker. */
const MIN_RECHECK_MS = 5_000;
/** The same new version is not asked for again until the page has had this long to show it. */
const REREQUEST_MS = 20_000;

/**
 * What identifies one publish. The same text the page renders and the endpoint answers with.
 *
 * The release flags are part of the signature because releasing the tee times, roster, rules or
 * leaderboard changes the same public page. Without them, an open pairings tab would wait for the
 * next publish before it noticed the organizer had released a held section.
 */
export function pairingsSignature(
  published: { at: string; version?: number | null } | null | undefined,
  release?: PublicReleaseState | null,
): string {
  const version = published ? `v${published.version ?? "-"}@${published.at}` : "none";
  if (!release) return version;
  const flags = [
    release.pairings,
    release.teeTimes,
    release.roster,
    release.leaderboard,
    release.photos,
    release.rules,
  ]
    .map((released) => (released ? "1" : "0"))
    .join("");
  return `${version}|${flags}`;
}

/** The browser, as the poller needs to see it. */
export interface PollerEnv {
  isVisible(): boolean;
  isOnline(): boolean;
  /** Calls `wake` when the tab becomes visible or the connection returns. Returns the unsubscribe. */
  onWake(wake: (reason: "visible" | "online") => void): () => void;
  now(): number;
}

export interface PollerOptions {
  /** The signature of what is on screen right now. Read on every check, so it is never stale. */
  rendered: () => string;
  /** Asks the endpoint for the current signature. Rejects on any failure. */
  fetchSignature: (signal: AbortSignal) => Promise<string>;
  /** The published version is not the one on screen. The page should reload. */
  onChange: (remote: string) => void;
  env: PollerEnv;
  baseMs?: number;
  maxMs?: number;
  /** Jitter source, so many open pages do not all ask in the same second. */
  random?: () => number;
}

export interface Poller {
  /** Checks now, unless a check ran moments ago (pass `true` to skip that limit). */
  checkNow(force?: boolean): Promise<void>;
  /** Stops for good: no timer, no request in flight, no listener. */
  stop(): void;
}

export function createPairingsPoller(options: PollerOptions): Poller {
  const { env } = options;
  const baseMs = options.baseMs ?? POLL_MS;
  const maxMs = options.maxMs ?? MAX_BACKOFF_MS;
  const random = options.random ?? Math.random;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let inFlight = false;
  let failures = 0;
  let lastCheckAt = Number.NEGATIVE_INFINITY;
  let requested: { signature: string; at: number } | null = null;

  /** 30s, then 60s, 120s, 240s, up to 5 minutes while failing; 30s again after one success. */
  const delay = () => Math.min(maxMs, baseMs * 2 ** failures);
  const withJitter = (ms: number) => Math.round(ms * (0.8 + 0.4 * random()));

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    if (stopped) return;
    clear();
    timer = setTimeout(() => void check(), withJitter(delay()));
  };

  async function check(): Promise<void> {
    timer = undefined;
    if (stopped || inFlight) return;
    // A hidden tab and an offline browser do not poll. They are checked the moment they wake.
    if (!env.isVisible() || !env.isOnline()) return;

    inFlight = true;
    controller = new AbortController();
    lastCheckAt = env.now();
    try {
      const remote = await options.fetchSignature(controller.signal);
      if (stopped) return;
      failures = 0;
      const alreadyAsked =
        requested !== null &&
        requested.signature === remote &&
        env.now() - requested.at < REREQUEST_MS;
      if (remote !== options.rendered() && !alreadyAsked) {
        requested = { signature: remote, at: env.now() };
        options.onChange(remote);
      }
    } catch {
      if (stopped) return;
      failures += 1;
    } finally {
      inFlight = false;
      controller = undefined;
    }
    schedule();
  }

  /** `force` skips the flicker limit: a returning connection is worth asking about at once. */
  const checkNow = async (force = false): Promise<void> => {
    if (stopped || (!force && env.now() - lastCheckAt < MIN_RECHECK_MS)) return;
    clear();
    await check();
  };

  const unsubscribe = env.onWake((reason) => {
    // The connection is back: forget the failures so the next ask is not delayed by old backoff.
    if (reason === "online") failures = 0;
    void checkNow(reason === "online");
  });

  schedule();

  return {
    checkNow,
    stop() {
      stopped = true;
      clear();
      controller?.abort();
      unsubscribe();
    },
  };
}
