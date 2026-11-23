"use client";

import { useEffect, useRef } from "react";
import { browserEnv } from "@/components/public/poller-env";
import type { ScoringRoundView } from "@/lib/data/scoring";
import { createPairingsPoller } from "@/lib/public/pairings-live";
import { roundLiveSignature } from "@/lib/scoring/live-signature";

/**
 * How often a visible scoring screen asks whether another desk user has saved something. Ten
 * seconds is short enough that a card entered on another screen appears while the desk is still
 * typing the next one, and long enough that a room full of screens costs a handful of reads a
 * minute. A hidden tab, an offline phone and a write already in flight ask nothing at all.
 */
export const DESK_LIVE_POLL_MS = 10_000;
/** The longest wait between checks while the round keeps failing to load. */
const DESK_LIVE_MAX_MS = 120_000;

/**
 * Keeps one scoring round current across the desk's screens without a manual refresh.
 *
 * Every desk user writes through the same guarded database functions, and each save returns the
 * new round to the screen that made it. The other screens learn about it here: the round is read
 * again on the same visible, online, jittered schedule the public pages use, and the screen is
 * replaced only when `roundLiveSignature` says the round actually moved. An unchanged read costs
 * nothing on screen, so a quiet round does not re-render a form someone is typing into.
 *
 * A read that was already in flight when this screen's own write landed is dropped: `stamp` is
 * read before the load and again before anything is applied, so an old copy of a just-approved
 * card cannot put the "Approve" button back for one poll cycle.
 */
export function useLiveRound({
  enabled,
  paused,
  stamp,
  signature,
  load,
  onFresh,
  baseMs = DESK_LIVE_POLL_MS,
}: {
  /** False in the sample round and before the event is known: there is nothing live to read. */
  enabled: boolean;
  /** True while this screen is writing, so no read starts and a late one never replaces the save. */
  paused: () => boolean;
  /** Bumped by every view this screen put on screen from its own read or write. */
  stamp: () => number;
  /** The round on screen now, as `roundLiveSignature` writes it. */
  signature: () => string;
  /** The round as of now. The signal is aborted when the screen closes or the hook stops. */
  load: (signal: AbortSignal) => Promise<ScoringRoundView | null>;
  /** Another desk user's save arrived. */
  onFresh: (next: ScoringRoundView) => void;
  baseMs?: number;
}) {
  // The latest props, read through refs: the poller lives across renders and must see this render.
  const latest = useRef({ enabled, paused, stamp, signature, load, onFresh, baseMs });
  latest.current = { enabled, paused, stamp, signature, load, onFresh, baseMs };

  useEffect(() => {
    if (!latest.current.enabled) return;
    // What this poller fetched, with the screen's stamp at the moment the read started.
    let fetched: { view: ScoringRoundView; stamp: number } | null = null;

    const poller = createPairingsPoller({
      rendered: () => latest.current.signature(),
      fetchSignature: async (signal) => {
        // A write on this screen owns the round until it answers. Asking now would race it.
        if (latest.current.paused()) return latest.current.signature();
        const stamp = latest.current.stamp();
        const next = await latest.current.load(signal);
        if (signal.aborted) return latest.current.signature();
        fetched = next ? { view: next, stamp } : null;
        return next ? roundLiveSignature(next) : "none";
      },
      onChange: () => {
        const arrived = fetched;
        // Nothing to show, a write in flight, or this screen has saved since the read started.
        if (!arrived || latest.current.paused() || latest.current.stamp() !== arrived.stamp) return;
        if (roundLiveSignature(arrived.view) === latest.current.signature()) return;
        latest.current.onFresh(arrived.view);
      },
      env: browserEnv(),
      baseMs: latest.current.baseMs,
      maxMs: DESK_LIVE_MAX_MS,
    });
    return () => poller.stop();
  }, [enabled]);
}
