"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { createPairingsPoller, type PollerEnv } from "@/lib/public/pairings-live";

const ENDPOINT = "/api/pairings/version";
/** How long the "just updated" note stays on screen. */
const NOTICE_MS = 8_000;

/** The real browser, for the poller. Only called inside an effect, so `document` always exists. */
function browserEnv(): PollerEnv {
  return {
    isVisible: () => document.visibilityState !== "hidden",
    isOnline: () => navigator.onLine !== false,
    onWake(wake) {
      const onVisible = () => {
        if (document.visibilityState === "visible") wake("visible");
      };
      const onOnline = () => wake("online");
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", onOnline);
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("online", onOnline);
      };
    },
    now: () => Date.now(),
  };
}

async function fetchSignature(signal: AbortSignal): Promise<string> {
  const response = await fetch(ENDPOINT, {
    cache: "no-store",
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`The version check answered ${response.status}.`);
  const body: unknown = await response.json();
  const signature =
    body && typeof body === "object" ? (body as { signature?: unknown }).signature : undefined;
  if (typeof signature !== "string") throw new Error("The version check gave no signature.");
  return signature;
}

/**
 * Keeps the public pairings current. It asks for the published version every 30 seconds while the
 * page is visible and online (and at once when the tab returns or the connection does), and when the
 * version is not the one on screen it asks the server to render the page again.
 *
 * A server refresh keeps the client's state, so the search box, the flight filter, the day tab and
 * the scroll position are all where the reader left them, and a moved player simply appears in the
 * new place. The "version · updated" line is drawn by the server in the same pass, so it follows
 * without any code here. Leaving the page stops the timer, aborts a request in flight and removes
 * the listeners.
 *
 * Nothing here draws on the screen except a short note that the pairings changed, so a card that
 * moved is explained rather than mysterious.
 */
export function PairingsLive({ signature }: { signature: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const shown = useRef(signature);
  const previous = useRef(signature);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    shown.current = signature;
  }, [signature]);

  useEffect(() => {
    const poller = createPairingsPoller({
      rendered: () => shown.current,
      fetchSignature,
      onChange: () => router.refresh(),
      env: browserEnv(),
    });
    return () => poller.stop();
  }, [router]);

  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    setNotice(true);
    const timer = window.setTimeout(() => setNotice(false), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [signature]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex justify-center px-4 lg:bottom-6"
      data-testid="pairings-live"
      data-signature={signature}
    >
      {notice && (
        <p
          className="notice pointer-events-auto m-0 shadow-card"
          data-testid="pairings-live-updated"
        >
          {t("pairings.liveUpdated")}
        </p>
      )}
    </div>
  );
}
