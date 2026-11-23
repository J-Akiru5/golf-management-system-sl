"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { PUBLIC_LIVE_MAX_MS, PUBLIC_LIVE_POLL_MS } from "@/lib/public/live-signature";
import { createPairingsPoller } from "@/lib/public/pairings-live";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { browserEnv } from "./poller-env";

const ENDPOINT = "/api/revalidate-pairings";

async function fetchSignature(signal: AbortSignal): Promise<string> {
  const response = await fetch(ENDPOINT, {
    // The edge may answer the same signature for a few seconds; a browser copy is never used.
    cache: "no-store",
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`The live check answered ${response.status}.`);
  const body: unknown = await response.json();
  const signature =
    body && typeof body === "object" ? (body as { signature?: unknown }).signature : undefined;
  if (typeof signature !== "string" || signature === "") {
    throw new Error("The live check gave no signature.");
  }
  return signature;
}

/**
 * Keeps a public results page current on its own.
 *
 * The page is rendered by the server from the frozen publication, so it can only ever show what the
 * desk has published. This asks the small live endpoint every 10 seconds while the tab is visible
 * and online, and at once when the tab returns or the connection does, then asks the server to
 * render the page again only when the published signature has moved. A publish therefore reaches an
 * open phone within one poll, and a phone in a pocket asks nothing.
 *
 * The endpoint reads the same cached public data as the page, so the poll costs no database read
 * while that cache is warm, and a publish clears it at once. A server refresh keeps the reader's
 * filters, day tab and scroll position, and this component draws nothing on the screen.
 */
export function PublicLive({
  signature,
  baseMs = PUBLIC_LIVE_POLL_MS,
}: {
  /** What this render shows, as `readPublicLiveSignature` writes it. */
  signature: string;
  baseMs?: number;
}) {
  const router = useRouter();
  const shown = useRef(signature);
  const live = isSupabaseConfigured() && signature !== "";

  useEffect(() => {
    shown.current = signature;
  }, [signature]);

  useEffect(() => {
    if (!live) return;
    const poller = createPairingsPoller({
      rendered: () => shown.current,
      fetchSignature,
      onChange: () => router.refresh(),
      env: browserEnv(),
      baseMs,
      maxMs: PUBLIC_LIVE_MAX_MS,
    });
    return () => poller.stop();
  }, [live, router, baseMs]);

  return null;
}
