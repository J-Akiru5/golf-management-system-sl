"use client";

import { EyeOff, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import type { PublicReleaseState } from "@/lib/data/public";
import { refreshPublicPage } from "@/lib/data/supabase/draw-sync";
import { loadPublicReleaseState, loadPublicRevealState } from "@/lib/data/supabase/public-programme";
import {
  holdResults,
  loadStoredReveal,
  releaseResults,
  saveStoredReveal,
} from "@/lib/data/supabase/results-blackout";
import { setDemoRelease, setDemoReveal, useDemoReleaseState } from "@/lib/demo/public-release";
import {
  REVEAL_DEFAULT_SECONDS,
  REVEAL_MAX_SECONDS,
  REVEAL_MIN_SECONDS,
  formatCountdown,
  revealAtFromSeconds,
  revealIsDue,
  revealSeconds,
} from "@/lib/public/results-reveal";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/ui/cn";

/**
 * The desk's results blackout.
 *
 * "Hide results and players now" turns off the `leaderboard` and `roster` release keys through
 * `set_public_release()`, the enforced setter, so a signed-out reader gets nothing even if they call
 * the public functions directly. "Reveal results in N seconds" stores a reveal time inside
 * `tournaments.publish_views` and counts down on the public pages; when it reaches zero this page
 * releases both keys again.
 *
 * The reveal is performed by this page because it needs an owner or organizer's own session to call
 * the setter. If the page is closed mid-countdown the public pages stay on the holding screen: they
 * show the results only when the database has released them, and the next visit to this page
 * finishes the reveal as soon as it sees the time has passed.
 */
export function ResultsBlackoutCard({
  tournamentId,
  canEdit,
  demo,
  compact = false,
}: {
  tournamentId: string;
  canEdit: boolean;
  demo: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const useLocal = demo || !isSupabaseConfigured();
  const local = useDemoReleaseState(tournamentId);

  const [release, setRelease] = useState<PublicReleaseState | null>(null);
  const [revealAt, setRevealAt] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(String(REVEAL_DEFAULT_SECONDS));
  const [busy, setBusy] = useState<"hold" | "reveal" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!useLocal);
  const [now, setNow] = useState(0);
  // null until known. False means the public read is not applied yet, so no public countdown.
  const [publicCountdown, setPublicCountdown] = useState<boolean | null>(null);
  const completing = useRef(false);

  const shown = useLocal ? local : release;
  const shownReveal = useLocal ? local.revealAt : revealAt;
  const held = shown ? shown.leaderboard === false || shown.roster === false : false;
  const remaining =
    shownReveal !== null && now > 0 ? Math.max(0, Date.parse(shownReveal) - now) : null;

  useEffect(() => {
    if (useLocal) return;
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const client = createSupabaseBrowserClient();
        const [state, stored] = await Promise.all([
          loadPublicReleaseState(client, tournamentId),
          loadStoredReveal(client, tournamentId),
        ]);
        if (!active) return;
        setRelease(state);
        setRevealAt(stored);
        if (stored) {
          const publicState = await loadPublicRevealState(client, tournamentId).catch(() => null);
          if (active) setPublicCountdown(publicState !== null);
        } else if (active) {
          setPublicCountdown(null);
        }
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

  // The clock only exists in the browser, so the first render never disagrees with the server.
  useEffect(() => {
    setNow(Date.now());
    if (shownReveal === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [shownReveal]);

  /** Releases both keys and clears the stored time. Runs once, and again on the next visit. */
  const complete = useCallback(async () => {
    if (completing.current) return;
    completing.current = true;
    setBusy("reveal");
    setError("");
    try {
      if (useLocal) {
        setDemoRelease(tournamentId, "leaderboard", true);
        setDemoRelease(tournamentId, "roster", true);
        setDemoReveal(tournamentId, null);
        return;
      }
      const client = createSupabaseBrowserClient();
      const state = await loadPublicReleaseState(client, tournamentId);
      const next = await releaseResults(client, tournamentId, state);
      await saveStoredReveal(client, tournamentId, null);
      await refreshPublicPage(client);
      setRelease(next);
      setRevealAt(null);
      setPublicCountdown(null);
      router.refresh();
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "Could not reveal the results.");
    } finally {
      completing.current = false;
      setBusy(null);
    }
  }, [router, tournamentId, useLocal]);

  useEffect(() => {
    if (now === 0 || !revealAt) return;
    if (revealIsDue(revealAt, now)) void complete();
  }, [complete, now, revealAt]);

  const hideNow = async () => {
    if (!canEdit || busy) return;
    if (
      !window.confirm(
        "Hide every public score and player page now? The leaderboard, All scores, player profiles and the roster stop answering, and the TV board shows the holding screen. Pairings, tee times and rules stay open.",
      )
    ) {
      return;
    }
    setBusy("hold");
    setError("");
    try {
      if (useLocal) {
        setDemoRelease(tournamentId, "leaderboard", false);
        setDemoRelease(tournamentId, "roster", false);
        setDemoReveal(tournamentId, null);
        return;
      }
      const client = createSupabaseBrowserClient();
      const next = await holdResults(client, tournamentId);
      await saveStoredReveal(client, tournamentId, null);
      // The public pages share their reads through a short cache; a hold is the moment it is wrong.
      await refreshPublicPage(client);
      setRelease(next);
      setRevealAt(null);
      setPublicCountdown(null);
      router.refresh();
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "Could not hide the results.");
    } finally {
      setBusy(null);
    }
  };

  const startReveal = async () => {
    if (!canEdit || busy) return;
    const count = revealSeconds(seconds);
    setSeconds(String(count));
    if (
      !window.confirm(
        `Hide the public results and show them again in ${count} second${count === 1 ? "" : "s"}? Every public page shows a countdown, then the results.`,
      )
    ) {
      return;
    }
    const at = revealAtFromSeconds(count, Date.now());
    setBusy("reveal");
    setError("");
    try {
      if (useLocal) {
        setDemoRelease(tournamentId, "leaderboard", false);
        setDemoRelease(tournamentId, "roster", false);
        setDemoReveal(tournamentId, at);
        setNow(Date.now());
        return;
      }
      const client = createSupabaseBrowserClient();
      const heldState = await holdResults(client, tournamentId);
      await saveStoredReveal(client, tournamentId, at);
      await refreshPublicPage(client);
      setRelease(heldState);
      setRevealAt(at);
      setNow(Date.now());
      const publicState = await loadPublicRevealState(client, tournamentId).catch(() => null);
      setPublicCountdown(publicState !== null);
      router.refresh();
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "Could not start the countdown.");
    } finally {
      setBusy(null);
    }
  };

  const cancelReveal = async () => {
    if (!canEdit || busy) return;
    if (!window.confirm("Cancel the countdown? The results stay hidden until you reveal them.")) {
      return;
    }
    setBusy("cancel");
    setError("");
    try {
      if (useLocal) {
        setDemoReveal(tournamentId, null);
        return;
      }
      const client = createSupabaseBrowserClient();
      await saveStoredReveal(client, tournamentId, null);
      await refreshPublicPage(client);
      setRevealAt(null);
      setPublicCountdown(null);
      router.refresh();
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "Could not cancel the countdown.");
    } finally {
      setBusy(null);
    }
  };

  const body = (
    <div className={cn("grid gap-3", compact && "gap-2")}>
      {!canEdit && (
        <p className="notice warn m-0" role="status">
          Only an owner or organizer can hide or reveal the results. You can still see the state.
        </p>
      )}

      {useLocal && (
        <p className="notice m-0" role="note">
          Demo preview: these controls are kept in this browser only. No live event is changed.
        </p>
      )}

      {error && (
        <p className="notice bad m-0" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("pill", held ? "warn" : "ok")}>
          {held ? "Results and players hidden" : "Results and players public"}
        </span>
        {shownReveal && (
          <span className="pill info" data-testid="blackout-countdown">
            {remaining === null ? "Reveal scheduled" : `Reveal in ${formatCountdown(remaining)}`}
          </span>
        )}
      </div>

      {shownReveal && (
        <p className="hint m-0" role="note" data-testid="blackout-keep-open">
          <Timer className="mr-1 inline size-4" aria-hidden="true" />
          Keep this page open until it reaches zero. This page is what releases the results; if it is
          closed, the public pages stay on the holding screen until someone opens this page again.
        </p>
      )}

      {shownReveal && !useLocal && publicCountdown === false && (
        <p className="notice warn m-0" role="status">
          The public countdown needs <code>public_reveal_state()</code> from
          <code> 20261115000100_results_reveal.sql</code>, which is not applied yet. Until then the
          public pages show the holding screen with no countdown, and this page still reveals on
          time.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="danger"
          size={compact ? "sm" : "md"}
          disabled={!canEdit || busy !== null || loading}
          onClick={() => void hideNow()}
          data-testid="blackout-hide"
        >
          <EyeOff aria-hidden="true" />
          {busy === "hold" ? "Hiding…" : "Hide results and players now"}
        </Button>

        <Button
          variant="gold"
          size={compact ? "sm" : "md"}
          disabled={!canEdit || busy !== null || loading}
          onClick={() => void startReveal()}
          data-testid="blackout-reveal"
        >
          {busy === "reveal" && !shownReveal ? "Starting…" : "Reveal results in"}
        </Button>

        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          <span className="sr-only">Seconds until the reveal</span>
          <input
            type="number"
            inputMode="numeric"
            min={REVEAL_MIN_SECONDS}
            max={REVEAL_MAX_SECONDS}
            step={1}
            value={seconds}
            onChange={(event) => setSeconds(event.target.value)}
            disabled={!canEdit || busy !== null || loading}
            aria-label="Seconds until the reveal"
            data-testid="blackout-seconds"
            className="h-10 w-20 rounded-md border border-line-strong bg-surface-raised px-2 text-center text-[15px] text-ink"
          />
          <span>seconds</span>
        </label>

        {shownReveal && (
          <Button
            variant="secondary"
            size={compact ? "sm" : "md"}
            disabled={!canEdit || busy !== null}
            onClick={() => void cancelReveal()}
            data-testid="blackout-cancel"
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel"}
          </Button>
        )}
      </div>

      {!compact && (
        <p className="hint m-0">
          Hiding now clears any countdown. A reveal stores the time on the event, so the public
          countdown survives a reload and this page finishes the reveal when it reaches zero.
        </p>
      )}
    </div>
  );

  if (compact) {
    return (
      <section
        aria-label="Results blackout"
        className="mt-2.5 grid gap-2 rounded-[10px] border border-line bg-surface-raised px-3 py-2.5"
        data-testid="results-blackout"
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <EyeOff className="size-4" aria-hidden="true" />
          Results blackout
        </div>
        {loading ? <p className="hint m-0">Loading…</p> : body}
      </section>
    );
  }

  return (
    <SectionCard
      id="results-blackout"
      icon={<EyeOff className="size-5" aria-hidden="true" />}
      title="Results blackout"
      subtitle="Hold the leaderboard, All scores, player profiles and the roster while the awarding is set up, then bring them back together. Pairings, tee times and rules stay open."
    >
      {loading ? <p className="hint m-0">Loading the controls…</p> : body}
    </SectionCard>
  );
}
