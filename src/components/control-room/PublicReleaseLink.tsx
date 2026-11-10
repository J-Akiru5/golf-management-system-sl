"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { heldReleaseSurfaces, type PublicReleaseState } from "@/lib/data/public";
import { loadPublicReleaseState } from "@/lib/data/supabase/public-programme";
import { useDemoReleaseState } from "@/lib/demo/public-release";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * A control-room reminder that the draw can be published while one or more public sections are
 * still held. Publishing the draw and releasing a public surface are separate decisions; this link
 * takes the organizer to the release card rather than letting the two be confused.
 */
export function PublicReleaseLink({ tournamentId }: { tournamentId: string }) {
  const demo = !isSupabaseConfigured();
  const local = useDemoReleaseState(tournamentId);
  const [connected, setConnected] = useState<PublicReleaseState | null>(null);

  useEffect(() => {
    if (demo) return;
    let active = true;
    loadPublicReleaseState(createSupabaseBrowserClient(), tournamentId)
      .then((state) => {
        if (active) setConnected(state);
      })
      .catch(() => {
        // The reminder is additive; the publish panel still works without it.
      });
    return () => {
      active = false;
    };
  }, [demo, tournamentId]);

  const state = demo ? local : connected;
  const held = state ? heldReleaseSurfaces(state) : [];
  if (held.length === 0) return null;

  return (
    <Link
      href="/setup#public-release"
      className="mt-2.5 flex items-center gap-2 rounded-[10px] border border-gold/50 bg-gold/10 px-3 py-2 text-[12px] font-semibold text-ink no-underline hover:bg-gold/20"
    >
      <LockKeyhole className="size-4 shrink-0" aria-hidden="true" />
      <span>
        {held.length === 1 ? "1 public section is held" : `${held.length} public sections are held`}
      </span>
      <span className="ml-auto text-forest underline">Release</span>
    </Link>
  );
}
