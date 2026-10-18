"use client";

import { Bell, Check, RefreshCw, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  badgeCount,
  bellLabel,
  buildAlerts,
  dismissableCount,
  groupAlerts,
  type StoredNotification,
} from "@/components/notifications/alerts";
import { Button } from "@/components/ui/button";
import {
  loadNotifications,
  markNotificationsRead,
  syncNotifications,
} from "@/lib/data/notifications";
import { validateDraw } from "@/lib/draw/validate";
import { useDesk } from "@/lib/store/desk-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type SyncState = "idle" | "checking" | "ready" | "error";

/**
 * The alerts bell.
 *
 * It is a **pointer**: the Draw screen's Issues panel stays the authority for draw problems, and
 * those rules are not copied into SQL. The bell merges the live `validateDraw` issues with the stored
 * notifications and de-duplicates the overlap, so the badge and the Issues panel cannot disagree.
 */
export function AlertsBell({ overlay = false }: { overlay?: boolean }) {
  const { state, registrations, names, tournament, draw, published } = useDesk();
  const connected = isSupabaseConfigured();
  const tournamentId = tournament?.id ?? null;

  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<StoredNotification[]>([]);
  const [sync, setSync] = useState<SyncState>("idle");
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The live draw issues, exactly as the Issues panel sees them.
  const issues = useMemo(
    () =>
      draw && tournament
        ? validateDraw({
            draw,
            registrations,
            config: tournament.config,
            engineWarnings: state.boards[state.activeTournamentId ?? ""]?.warnings ?? [],
            names,
          })
        : [],
    [draw, registrations, tournament, names, state.boards, state.activeTournamentId],
  );

  const alerts = useMemo(() => buildAlerts(stored, issues), [stored, issues]);
  const count = badgeCount(alerts);
  const groups = groupAlerts(alerts);
  const dismissable = dismissableCount(alerts);

  /**
   * A signature of the things that can create or clear an alert. Watching this and debouncing means
   * one call after a burst of moves, and no polling: a change to the data is what triggers a check.
   */
  const signature = useMemo(
    () =>
      [
        registrations.map((r) => `${r.playerId}:${r.status}`).join(","),
        draw?.map((g) => `${g.number}:${g.playerIds.join("+")}:${g.locked}`).join("|") ?? "",
        String(published !== null),
      ].join("#"),
    [registrations, draw, published],
  );

  const check = useCallback(async () => {
    if (!connected || !tournamentId) {
      // Demo mode: the bell works from the live issues alone.
      setSync("idle");
      return;
    }
    setSync("checking");
    try {
      const client = createSupabaseBrowserClient();
      await syncNotifications(client, tournamentId);
      setStored(await loadNotifications(client, tournamentId));
      setSync("ready");
    } catch {
      // Keep the last good list rather than showing a false "all clear".
      setSync("error");
    }
  }, [connected, tournamentId]);

  useEffect(() => {
    const timer = setTimeout(() => void check(), 400);
    return () => clearTimeout(timer);
  }, [check, signature]);

  // Escape closes, and focus goes back to the bell rather than being lost.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        bellRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      // Focus stays inside the panel while it is open.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function dismissNotices() {
    if (!tournamentId || !connected) return;
    try {
      await markNotificationsRead(createSupabaseBrowserClient(), tournamentId);
      setStored((current) => current.map((n) => ({ ...n, read: true })));
    } catch {
      setSync("error");
    }
  }

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={bellLabel(count)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`relative grid size-11 place-items-center rounded-full ${overlay ? "glass" : "border border-[rgba(238,240,234,0.25)]"}`}
      >
        <Bell className="size-5" aria-hidden="true" />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 grid min-w-[20px] place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-on-danger"
            aria-hidden="true"
          >
            {count}
          </span>
        )}
      </button>

      {/* One panel, two shapes: a dropdown from the top bar on desktop, a full-width sheet below. */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Alerts"
          className="fixed inset-x-0 top-[84px] bottom-0 z-50 overflow-y-auto bg-surface p-4 shadow-card lg:absolute lg:inset-auto lg:top-14 lg:right-0 lg:max-h-[70vh] lg:w-[26rem] lg:rounded-[14px] lg:border lg:border-line lg:p-3"
        >
          <div className="flex items-center justify-between gap-2 pb-2">
            <b className="text-[15px]">Alerts</b>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close alerts"
              onClick={() => {
                setOpen(false);
                bellRef.current?.focus();
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          {/* Polite, never assertive: this must not interrupt what the desk is typing. */}
          <p className="sr" aria-live="polite">
            {sync === "checking"
              ? "Checking for alerts."
              : sync === "error"
                ? "Could not check alerts."
                : bellLabel(count)}
          </p>

          {sync === "checking" && (
            <p className="flex items-center gap-2 py-3 text-[13px] text-ink-muted" role="status">
              <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
              Checking…
            </p>
          )}

          {sync === "error" && (
            <div className="notice bad my-2" role="alert">
              <b>Could not check alerts. Try again.</b>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => void check()}
              >
                <RefreshCw aria-hidden="true" /> Retry
              </Button>
            </div>
          )}

          {alerts.length === 0 && sync !== "checking" && sync !== "error" && (
            <p className="py-4 text-[14px] text-ink-muted" role="status">
              All clear. Nothing is stopping you from publishing.
            </p>
          )}

          {groups.map((group) => (
            <section key={group.severity} className="grid gap-1.5 py-2">
              <h3 className="overline flex items-center gap-1.5 !text-ink-muted">
                {group.severity === "warning" && (
                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                )}
                {group.heading}
              </h3>
              {group.alerts.map((alert) => (
                <Link
                  key={alert.id}
                  href={alert.href}
                  onClick={() => setOpen(false)}
                  className="grid min-h-11 gap-0.5 rounded-[10px] border border-line px-3 py-2 no-underline hover:bg-surface-sunken"
                >
                  <b className="text-[14px] text-ink">{alert.title}</b>
                  {alert.detail && <span className="hint">{alert.detail}</span>}
                  <span className="text-[12px] font-semibold text-link">Fix</span>
                </Link>
              ))}
            </section>
          ))}

          {dismissable > 0 && (
            <div className="border-t border-line pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void dismissNotices()}
              >
                <Check aria-hidden="true" /> Dismiss {dismissable} notice
                {dismissable === 1 ? "" : "s"}
              </Button>
              <p className="hint mt-1">
                Notices are information only. Blocking and warning items stay until they are fixed.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
