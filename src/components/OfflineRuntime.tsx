"use client";

import { useEffect } from "react";
import { clearOfflineData, noteAuthUser } from "@/lib/offline/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Registers the service worker and guards the offline snapshots across sign-ins.
 *
 * The worker is registered only in a production build. During `next dev` the hashed chunks change
 * on every edit, and a cache-first worker would serve an old screen while the developer is looking
 * at new code. `next start` and the deployed build do register it.
 *
 * Two auth events clear the snapshot:
 *   - SIGNED_OUT, which covers the sign-out button and an expired session.
 *   - SIGNED_IN with a different account than the one that wrote the snapshot, which covers a
 *     shared phone handed to another player without a clean sign-out.
 *
 * The sign-out button also clears before it submits (see SignOutForm), so the clear is finished
 * before the redirect rather than racing it.
 */
export function OfflineRuntime() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // An install failure leaves the app online-only; it must not break the page.
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let client: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      client = createSupabaseBrowserClient();
    } catch {
      return;
    }

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        void clearOfflineData();
        return;
      }
      if (event === "SIGNED_IN" && session?.user) {
        void noteAuthUser(session.user.id);
      }
    });

    // The page may already hold a session when this mounts; the event above only fires on change.
    void client.auth
      .getSession()
      .then(({ data: session }) => {
        if (session.session?.user) void noteAuthUser(session.session.user.id);
      })
      .catch(() => {
        // A storage or network failure here must not break the page; the event listener still runs.
      });

    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
