"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { NO_SNAPSHOT_NOTICE, offlineNotice } from "@/lib/offline/cache";
import { lastSeenAt, rememberSeen, savePlayerSnapshot } from "@/lib/offline/store";
import type { PortalState } from "@/lib/player/portal";

/** Writes the player's portal read to the phone, so /offline can show it with no signal. */
export function RememberPortal({ state }: { state: PortalState }) {
  useEffect(() => {
    if (!state.linked || !state.player) return;
    // Rehydrating a cached page must not reset the saved time to now; only a live read is saved.
    if (navigator.onLine === false) return;
    void savePlayerSnapshot(state.player.id, state);
  }, [state]);
  return null;
}

/**
 * The notice on a player page served from the service worker's copy. It appears only after the
 * browser reports no connection, so a normal visit stays quiet and server rendering never guesses.
 */
export function PlayerOfflineNotice({ path = "/my" }: { path?: string }) {
  const [offline, setOffline] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setOffline(!navigator.onLine);
      setSavedAt(lastSeenAt(path));
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [path]);

  useEffect(() => {
    if (navigator.onLine) rememberSeen(path);
  }, [path]);

  if (!offline) return null;
  return (
    <p className="notice warn flex items-start gap-2" role="status" data-testid="offline-notice">
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{savedAt ? offlineNotice(savedAt) : NO_SNAPSHOT_NOTICE}</span>
    </p>
  );
}
