"use client";

import { useEffect, useState } from "react";
import { revealRemainingMs } from "@/lib/public/results-reveal";

/**
 * How long until the stored reveal time, re-rendered twice a second while it runs.
 *
 * The device's clock is only used to measure how long it has been since this page rendered; the
 * remaining time itself comes from the server's clock (`serverNow`). That keeps a phone whose clock
 * is minutes or hours out from showing a countdown that disagrees with the screen next to it.
 *
 * `serverNow` is null in the no-database demo, which has no server clock to trust. The first paint
 * then shows the label without a number and the number appears once the browser is running, so the
 * server render and the hydration never disagree.
 */
export function useRevealCountdown(
  revealAt: string | null,
  serverNow: string | null,
): number | null {
  const [clock, setClock] = useState<{ receivedAt: number; now: number } | null>(null);

  useEffect(() => {
    if (!revealAt) {
      setClock(null);
      return;
    }
    const receivedAt = Date.now();
    setClock({ receivedAt, now: receivedAt });
    const timer = window.setInterval(() => setClock({ receivedAt, now: Date.now() }), 500);
    return () => window.clearInterval(timer);
  }, [revealAt]);

  if (!revealAt) return null;
  if (clock) {
    return revealRemainingMs({ revealAt, serverNow: serverNow ?? clock.receivedAt, ...clock });
  }
  if (!serverNow) return null;
  // The exact value the server rendered, so the first client paint matches it.
  return revealRemainingMs({ revealAt, serverNow, receivedAt: 0, now: 0 });
}
