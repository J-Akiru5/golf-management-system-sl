"use client";

import { ExternalLink, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SectionCard } from "@/components/PageHeader";
import { refreshPublicPage } from "@/lib/data/supabase/draw-sync";
import { loadLandingFeature, setLandingFeature } from "@/lib/data/supabase/landing-feature";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/ui/cn";

const DETAIL =
  "Shows this event at the top of the home page with its quick actions (See all scores, View published pairings). One event at a time: turning this on replaces any other featured event.";

/**
 * The desk's home page feature switch.
 *
 * The public home page never picks an event: it shows whatever an organizer has featured here, and
 * nothing when the setting is off. The column is readable through the club's RLS and written only
 * through `set_landing_feature()`, which checks the role and clears any other featured event of the
 * club, so the card is a view of that setting rather than a second rule.
 */
export function LandingFeatureCard({
  tournamentId,
  canEdit,
  demo,
}: {
  tournamentId: string;
  canEdit: boolean;
  demo: boolean;
}) {
  const router = useRouter();
  // Demo mode, and a build with no Supabase at all, have nothing to read or write.
  const demoMode = demo || !isSupabaseConfigured();
  const [featured, setFeatured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    setLoading(true);
    setUnavailable(false);
    setError("");
    (async () => {
      try {
        const client = createSupabaseBrowserClient();
        const read = await loadLandingFeature(client, tournamentId);
        if (!active) return;
        setFeatured(read?.featured ?? null);
        setUnavailable(read === null);
      } catch (readError) {
        if (!active) return;
        setError(readError instanceof Error ? readError.message : "Could not load the setting.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tournamentId, demoMode]);

  const toggle = async () => {
    if (!canEdit || saving || featured === null) return;
    const previous = featured;
    const next = !previous;
    setSaving(true);
    setError("");
    // The switch moves at once; a refused write puts it back, so it never reports a change the
    // database did not record.
    setFeatured(next);
    try {
      const client = createSupabaseBrowserClient();
      const saved = await setLandingFeature(client, tournamentId, next);
      setFeatured(saved);
      // The home page is cached for a short window; a feature change is the moment that cache is
      // wrong.
      await refreshPublicPage(client);
      router.refresh();
    } catch (writeError) {
      setFeatured(previous);
      setError(writeError instanceof Error ? writeError.message : "Could not save the change.");
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || saving || demoMode || unavailable || featured === null;

  return (
    <SectionCard
      id="landing-feature"
      icon={<Star className="size-5" aria-hidden="true" />}
      title="TeeLine home page"
      subtitle="Which event the public home page shows at the top."
      action={
        <a className="btn ghost no-print" href="/" target="_blank" rel="noreferrer">
          View home page <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      }
    >
      <div className="grid gap-2 rounded-[12px] border border-line bg-surface-raised px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <b className="text-[14px] text-ink">Feature this event on the home page</b>
          <p className="hint m-0 mt-0.5">{DETAIL}</p>
        </div>
        <div className="flex items-center gap-2 sm:justify-self-end">
          {saving && <span className="hint m-0">Saving…</span>}
          <button
            type="button"
            role="switch"
            aria-checked={featured === true}
            aria-label="Feature this event on the home page"
            disabled={disabled}
            onClick={() => void toggle()}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
              featured === true
                ? "border-forest bg-forest"
                : "border-line-strong bg-surface-sunken",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-[left]",
                featured === true ? "left-[22px]" : "left-0.5",
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {demoMode && (
        <p className="notice m-0" role="note">
          Connect the live database to use this.
        </p>
      )}

      {!demoMode && loading && (
        <p className="hint m-0" role="status">
          Loading the setting…
        </p>
      )}

      {!demoMode && !loading && unavailable && (
        <p className="notice warn m-0" role="status">
          Available after the next database update.
        </p>
      )}

      {!canEdit && !demoMode && (
        <p className="hint m-0" role="note">
          Only the owner or an organizer can change this. You can still see the setting.
        </p>
      )}

      {error && (
        <p className="notice bad m-0" role="alert">
          {error}
        </p>
      )}
    </SectionCard>
  );
}
