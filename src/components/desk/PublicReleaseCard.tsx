"use client";

import { ExternalLink, LockKeyhole, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SectionCard } from "@/components/PageHeader";
import {
  heldReleaseSurfaces,
  type PublicReleaseState,
  type PublicReleaseSurface,
} from "@/lib/data/public";
import { refreshPublicPage } from "@/lib/data/supabase/draw-sync";
import { loadPublicReleaseState, setPublicRelease } from "@/lib/data/supabase/public-programme";
import { setDemoRelease, useDemoReleaseState } from "@/lib/demo/public-release";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/ui/cn";

const SURFACES: Array<{
  key: PublicReleaseSurface;
  label: string;
  detail: string;
  preview: string;
}> = [
  {
    key: "pairings",
    label: "Pairings and groups",
    detail: "The published draw, group by group. A hold never changes the draw itself.",
    preview: "/pairings",
  },
  {
    key: "teeTimes",
    label: "Tee times by day",
    detail: "The confirmed day schedule and the start times on the pairings page.",
    preview: "/pairings#tee-times",
  },
  {
    key: "roster",
    label: "Player list",
    detail: "Name, home club, index, category and flight on the public roster.",
    preview: "/roster",
  },
  {
    key: "leaderboard",
    label: "Leaderboard and results",
    detail: "The cumulative team table, published rounds and player scorecards.",
    preview: "/leaderboard",
  },
  {
    key: "photos",
    label: "Player photos",
    detail: "Only photos with separate public-display consent. A hold removes all of them.",
    preview: "/leaderboard",
  },
  {
    key: "rules",
    label: "Rules of play",
    detail: "The organizer's rules text on the pairings page. The static rules page is separate.",
    preview: "/pairings#rules",
  },
];

const WHEN = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function shortId(value: string): string {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

/**
 * The desk's public-release card.
 *
 * The card is a view of the database policy, not a second policy. In connected mode it reads
 * `public_release_state()` and writes through `set_public_release()`, both of which are enforced in
 * the database. In demo mode it uses the local preview store so the screens can be reviewed
 * without changing a live event.
 */
export function PublicReleaseCard({
  tournamentId,
  tournamentName,
  canEdit,
  demo,
}: {
  tournamentId: string;
  tournamentName: string;
  canEdit: boolean;
  demo: boolean;
}) {
  const router = useRouter();
  const local = useDemoReleaseState(tournamentId);
  const useLocal = demo || !isSupabaseConfigured();
  const [connected, setConnected] = useState<PublicReleaseState | null>(null);
  const [loading, setLoading] = useState(!useLocal);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, setPending] = useState<PublicReleaseSurface | null>(null);
  const [error, setError] = useState("");
  const [lastChange, setLastChange] = useState<{ at: string | null; by: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (useLocal) return;
    let active = true;
    setLoading(true);
    setUnavailable(false);
    setError("");
    (async () => {
      try {
        const client = createSupabaseBrowserClient();
        const [state, audit] = await Promise.all([
          loadPublicReleaseState(client, tournamentId),
          loadLastChange(client, tournamentId).catch(() => null),
        ]);
        if (!active) return;
        setConnected(state);
        setUnavailable(state === null);
        setLastChange(audit);
      } catch (readError) {
        if (!active) return;
        setError(readError instanceof Error ? readError.message : "Could not load the controls.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tournamentId, useLocal]);

  const state = useLocal ? local : connected;
  const held = state ? heldReleaseSurfaces(state) : [];
  const shownChange = useLocal ? { at: local.updatedAt, by: local.updatedBy } : lastChange;

  const toggle = async (surface: PublicReleaseSurface, label: string) => {
    if (!canEdit || !state || pending) return;
    const released = state[surface] === false;
    const action = released ? "release" : "hold";
    const consequence = released
      ? "The public page will show this section."
      : "The public page will stop showing this section.";
    if (!window.confirm(`${action === "release" ? "Release" : "Hold"} ${label}? ${consequence}`)) {
      return;
    }

    setPending(surface);
    setError("");
    try {
      if (useLocal) {
        setDemoRelease(tournamentId, surface, released);
        return;
      }
      const client = createSupabaseBrowserClient();
      const next = await setPublicRelease(client, tournamentId, surface, released);
      if (next) setConnected(next);
      // The public pages share their published reads through a short cache, so a hold or a release
      // is the moment that cache is wrong. Clearing it here is what makes the toggle take effect
      // at once instead of within the window.
      await refreshPublicPage(client);
      setLastChange({ at: new Date().toISOString(), by: "You" });
      router.refresh();
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "Could not save the change.");
    } finally {
      setPending(null);
    }
  };

  return (
    <SectionCard
      id="public-release"
      icon={<Radio className="size-5" aria-hidden="true" />}
      title="Public page"
      subtitle={`What a signed-out visitor may see for ${tournamentName}. Releasing a frozen section does not publish a draft or change the draw.`}
      action={
        <Link className="btn ghost no-print" href="/pairings">
          Preview <ExternalLink className="size-4" aria-hidden="true" />
        </Link>
      }
    >
      {useLocal ? (
        <p className="notice m-0" role="note">
          Demo preview: these switches are kept in this browser only. No live event is changed.
        </p>
      ) : (
        <p className="hint m-0">
          The database is the gate. A held section returns no data to an anonymous reader, even if
          someone calls the public function directly.
        </p>
      )}

      {!canEdit && (
        <p className="notice warn m-0" role="status">
          <LockKeyhole className="mr-1 inline size-4" aria-hidden="true" />
          Only an owner or organizer may change these switches. You can still see what is held.
        </p>
      )}

      {error && (
        <p className="notice bad m-0" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="hint m-0" role="status">
          Loading the release state…
        </p>
      ) : unavailable ? (
        <p className="notice warn m-0" role="status">
          The release controls are not available until the database migration is applied.
        </p>
      ) : (
        <div className="grid gap-2">
          {SURFACES.map((surface) => {
            const isReleased = state?.[surface.key] !== false;
            const isHeld = !isReleased;
            const busy = pending === surface.key;
            return (
              <div
                key={surface.key}
                className="grid gap-2 rounded-[12px] border border-line bg-surface-raised px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[14px] text-ink">{surface.label}</b>
                    <span className={cn("pill", isHeld ? "warn" : "ok")}>
                      {isHeld ? "Held" : "Released"}
                    </span>
                  </div>
                  <p className="hint m-0 mt-0.5">{surface.detail}</p>
                  <Link className="text-[12px] text-forest underline" href={surface.preview}>
                    Preview this surface
                  </Link>
                </div>
                <div className="flex items-center gap-2 sm:justify-self-end">
                  {busy && <span className="hint m-0">Saving…</span>}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isReleased}
                    aria-label={`${surface.label}: ${isReleased ? "released" : "held"}`}
                    disabled={!canEdit || pending !== null || !state}
                    onClick={() => void toggle(surface.key, surface.label)}
                    className={cn(
                      "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
                      isReleased
                        ? "border-forest bg-forest"
                        : "border-line-strong bg-surface-sunken",
                      (!canEdit || pending !== null || !state) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-[left]",
                        isReleased ? "left-[22px]" : "left-0.5",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="hint m-0">
          {shownChange?.at
            ? `Last release change: ${WHEN.format(new Date(shownChange.at))}${
                shownChange.by ? ` by ${shownChange.by}` : ""
              }.`
            : "No release change recorded yet."}
        </p>
        {held.length > 0 && (
          <span className="pill warn">
            <ShieldCheck className="mr-1 size-3.5" aria-hidden="true" />
            {held.length === 1 ? "1 section held" : `${held.length} sections held`}
          </span>
        )}
      </div>
      <p className="hint m-0">
        A player's own pair and start are not controlled here; they come from the player portal.
      </p>
    </SectionCard>
  );
}

async function loadLastChange(
  client: ReturnType<typeof createSupabaseBrowserClient>,
  tournamentId: string,
): Promise<{ at: string | null; by: string | null } | null> {
  const { data, error } = await client
    .from("tournaments")
    .select("publish_views_updated_at, publish_views_updated_by")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error || !data) return null;

  let by: string | null = null;
  if (data.publish_views_updated_by) {
    const { data: member } = await client
      .from("club_members")
      .select("display_name, user_id")
      .eq("user_id", data.publish_views_updated_by)
      .limit(1)
      .maybeSingle();
    by = member?.display_name ?? shortId(data.publish_views_updated_by);
  }
  return { at: data.publish_views_updated_at ?? null, by };
}
