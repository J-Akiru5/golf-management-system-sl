"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createPairingsPoller } from "@/lib/public/pairings-live";
import { parseRevealPoll, revealSignature } from "@/lib/public/results-reveal";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { browserEnv } from "./poller-env";

const ENDPOINT = "/api/results/reveal";
/** The endpoint is cheap, but a failing one does not need a request every few seconds. */
const MAX_BACKOFF_MS = 20_000;

async function fetchSignature(signal: AbortSignal): Promise<string> {
  const response = await fetch(ENDPOINT, {
    cache: "no-store",
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`The reveal check answered ${response.status}.`);
  const body = parseRevealPoll(await response.json());
  if (!body) throw new Error("The reveal check gave no answer.");
  return revealSignature(body.held, body.revealAt);
}

/**
 * Tells the holding screen when the hold has ended.
 *
 * It asks a small public endpoint for the two release keys and the reveal time, and refreshes the
 * page when either has moved. The page that comes back is rendered by the server from the database,
 * so the results can only appear when the database itself has released them: this component never
 * reveals anything and a wrong clock on the device changes nothing. The same idea as the pairings
 * version poll, with a shorter interval so the countdown and the results arrive together.
 */
export function RevealPoller({
  rendered,
  baseMs,
}: {
  /** What the page is showing now, as `revealSignature` writes it. */
  rendered: string;
  /** 2.5 seconds near the end of the countdown, 5 seconds otherwise. */
  baseMs: number;
}) {
  const router = useRouter();
  const shown = useRef(rendered);
  const live = isSupabaseConfigured();

  useEffect(() => {
    shown.current = rendered;
  }, [rendered]);

  useEffect(() => {
    if (!live) return;
    const poller = createPairingsPoller({
      rendered: () => shown.current,
      fetchSignature,
      onChange: () => router.refresh(),
      env: browserEnv(),
      baseMs,
      maxMs: MAX_BACKOFF_MS,
    });
    return () => poller.stop();
  }, [live, router, baseMs]);

  return null;
}
