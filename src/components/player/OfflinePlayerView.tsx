"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PortalEntries } from "@/components/player/PortalView";
import { t as english } from "@/lib/i18n/t";
import { NO_SNAPSHOT_NOTICE, offlineNotice, SnapshotEnvelope } from "@/lib/offline/cache";
import { loadPlayerSnapshot } from "@/lib/offline/store";
import type { PortalState } from "@/lib/player/portal";

/**
 * The player's last saved entry, read from the phone when the server cannot be reached. The copy
 * comes from `player_portal_entries`, which already excludes phone numbers, birthdates and photos,
 * and it says when it was saved. It is never labelled as published or live data.
 */
export function OfflinePlayerView() {
  const [snapshot, setSnapshot] = useState<SnapshotEnvelope<PortalState> | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void loadPlayerSnapshot()
      .then((found) => setSnapshot(found))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return (
      <p className="hint" role="status">
        Looking for a saved copy on this phone…
      </p>
    );
  }

  if (!snapshot) {
    return (
      <p className="notice warn" role="status">
        {NO_SNAPSHOT_NOTICE}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="notice warn" role="status" data-testid="offline-snapshot-notice">
        {offlineNotice(snapshot.savedAt)}
      </p>
      <p className="hint">
        The club may have changed things since this copy was saved. Nothing here is live.
      </p>
      <PortalEntries state={snapshot.payload} t={english} nameHeading="h2" />
      <div className="flex flex-wrap gap-2">
        <Link href="/my" className="btn small no-underline">
          Try my golf again
        </Link>
        <Link href="/pairings" className="btn small ghost no-underline">
          All pairings
        </Link>
      </div>
    </div>
  );
}
