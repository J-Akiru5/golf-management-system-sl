import type { PollerEnv } from "@/lib/public/pairings-live";

/**
 * The real browser, as the pollers see it. Only called from an effect, so `document` exists.
 *
 * Shared by the pairings refresher and the results holding screen: both should stop asking while
 * the tab is hidden or the connection is down, and ask at once when either comes back.
 */
export function browserEnv(): PollerEnv {
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
