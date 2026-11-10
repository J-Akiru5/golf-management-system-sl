"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { countNewFeedbackNotes } from "@/lib/data/feedback";
import { countNewFeedback } from "@/lib/data/supabase/feedback";
import { loadDemoFeedback } from "@/lib/demo/feedback";
import { FEEDBACK_CHANGED_EVENT } from "@/lib/feedback-events";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** A quiet interval: the badge is a nudge, not a live feed. Focus and the inbox event also refresh. */
const POLL_INTERVAL_MS = 60_000;

/**
 * The private new-feedback count for the desk shell.
 *
 * In a connected build the count comes from the staff RLS read. In the demo it comes from the local
 * store. A failed count keeps the last known number rather than breaking the shell, and nothing here
 * is reachable from a public page.
 */
export function useFeedbackAlertCount({ clubId, demo }: { clubId: string; demo: boolean }): number {
  const [count, setCount] = useState(0);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (demo) {
      if (mounted.current) setCount(countNewFeedbackNotes(loadDemoFeedback()));
      return;
    }
    if (!clubId || !isSupabaseConfigured()) {
      if (mounted.current) setCount(0);
      return;
    }
    try {
      const next = await countNewFeedback(createSupabaseBrowserClient(), clubId);
      if (mounted.current) setCount(next);
    } catch {
      // The badge is advisory. The inbox still works and a later poll can recover.
    }
  }, [clubId, demo]);

  useEffect(() => {
    mounted.current = true;
    void load();

    const refresh = () => {
      void load();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener(FEEDBACK_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);

    return () => {
      mounted.current = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener(FEEDBACK_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(timer);
    };
  }, [load]);

  return count;
}
