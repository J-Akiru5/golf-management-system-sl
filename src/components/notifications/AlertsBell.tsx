"use client";

import { Bell, Check, RefreshCw, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Alert,
  type AlertCheckState,
  applyReadState,
  badgeCount,
  bellLabel,
  buildAlerts,
  canMarkRead,
  groupAlerts,
  isUnreadMarkable,
  markableCount,
  parseReadBroadcast,
  registrationAlerts,
  type StoredNotification,
  shouldCheckAlerts,
  showsAllClear,
  splitAlerts,
  storedIdOf,
} from "@/components/notifications/alerts";
import { Button } from "@/components/ui/button";
import {
  loadNotifications,
  markNotificationRead,
  markNotificationsRead,
  pendingRegistrationCount,
  syncNotifications,
} from "@/lib/data/notifications";
import { validateDraw } from "@/lib/draw/validate";
import { useDesk } from "@/lib/store/desk-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * The alerts bell.
 *
 * It is a **pointer**: the Draw screen's Issues panel stays the authority for draw problems, and
 * those rules are not copied into SQL. The bell merges the live `validateDraw` issues with the stored
 * notifications and de-duplicates the overlap, so the badge and the Issues panel cannot disagree.
 */
export function AlertsBell({ overlay = false }: { overlay?: boolean }) {
  const {
    state,
    registrations,
    entries,
    names,
    tournament,
    draw,
    published,
    status,
    players,
    reload,
  } = useDesk();
  const connected = isSupabaseConfigured();
  const tournamentId = tournament?.id ?? null;
  const pathname = usePathname();
  // No stored check until the desk has loaded: before that the working event is the demo one.
  const ready = shouldCheckAlerts(connected, status);

  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<StoredNotification[]>([]);
  // Demo mode keeps read marks in memory. Connected mode writes a per-user row for a stored alert,
  // but a live info item has no row anywhere, so its mark is local and goes when the issue does.
  const [localRead, setLocalRead] = useState<ReadonlySet<string>>(() => new Set());
  // Connected mode starts in "checking": until the first check returns, the panel must not claim
  // there is nothing to do.
  const [sync, setSync] = useState<AlertCheckState>(connected ? "checking" : "idle");
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const readChannel = useRef<BroadcastChannel | null>(null);

  // A read mark in one tab should not wait for the other tab's next poll. The channel carries only
  // ids; the receiver applies them to the rows it already has.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("teeline:alert-read");
    readChannel.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const update = parseReadBroadcast(event.data);
      if (!update) return;
      const storedIds = new Set(update.storedIds);
      setStored((current) =>
        current.map((row) => (storedIds.has(row.id) ? { ...row, read: true } : row)),
      );
      setLocalRead((current) => {
        const next = new Set(current);
        for (const id of update.localIds) next.add(id);
        return next;
      });
    };
    return () => {
      channel.close();
      readChannel.current = null;
    };
  }, []);

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

  const allAlerts = useMemo(() => {
    // One alert per entry waiting at the desk, named after the player. Derived from the loaded
    // registrations, so it clears itself the moment the entry is confirmed; no migration, no
    // stored row to go stale. Demo mode has no public form, so it keeps the bell it had.
    const playerNames = new Map(players.map((player) => [player.id, player.name]));
    const pending = connected
      ? registrationAlerts(registrations, (playerId) => playerNames.get(playerId) ?? null)
      : [];
    return buildAlerts(stored, issues, pending);
  }, [stored, issues, players, registrations, connected]);
  const alerts = useMemo(() => applyReadState(allAlerts, localRead), [allAlerts, localRead]);
  const { unread, read } = useMemo(() => splitAlerts(alerts), [alerts]);
  const count = badgeCount(alerts);
  const groups = useMemo(() => groupAlerts(unread), [unread]);
  const markable = markableCount(alerts);

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

  const check = useCallback(
    async (silent = false) => {
      if (!connected || !tournamentId) {
        // Demo mode: the bell works from the live issues alone.
        setSync("idle");
        return;
      }
      if (!ready) return;
      // A background refresh must not flash "Checking…" over a panel the desk is reading.
      if (!silent) setSync("checking");
      try {
        const client = createSupabaseBrowserClient();
        await syncNotifications(client, tournamentId);
        setStored(await loadNotifications(client, tournamentId));
        setSync("ready");
      } catch {
        // Keep the last good list rather than showing a false "all clear".
        setSync("error");
      }
    },
    [connected, tournamentId, ready],
  );

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void check(), 400);
    return () => clearTimeout(timer);
  }, [check, signature, ready]);

  // A public entry can arrive while the desk is open and nothing on this screen changes. Poll one
  // count a minute, and again when the tab regains focus, and refresh the stored alerts everywhere.
  // The desk itself reloads only on the registration screen: no timer throws away an open form on
  // Setup, the Draw or the scorecard.
  //
  // The count is of entries waiting at the desk (the database's own `status`), so it is compared
  // with the loaded entries in that same state: a bigger number means one arrived that has not
  // been loaded. One reload per new count, so a difference that survives a reload does not reload
  // every minute; the list's own Refresh entries control covers that.
  const needsReviewLoaded = entries.filter((r) => r.status === "needs_review").length;
  const needsReview = useRef(needsReviewLoaded);
  needsReview.current = needsReviewLoaded;
  const reloadedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!connected || !tournamentId || !ready) return;
    let alive = true;
    const poll = async () => {
      let count: number | null = null;
      try {
        count = await pendingRegistrationCount(createSupabaseBrowserClient(), tournamentId);
      } catch {
        // A failed count says nothing about the entries; keep the last known bell state.
        return;
      }
      if (!alive || count === null) return;
      const arrived = count > needsReview.current && reloadedFor.current !== count;
      if (pathname === "/register" && arrived) {
        reloadedFor.current = count;
        reload();
      }
      await check(true);
    };
    const onFocus = () => void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, 60_000);
    window.addEventListener("focus", onFocus);
    void poll();
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [check, connected, pathname, ready, reload, tournamentId]);

  // A desk that failed to load cannot have its alerts checked; say so rather than "Checking…".
  useEffect(() => {
    if (connected && status === "error") setSync("error");
  }, [connected, status]);

  // A route change closes the panel. A link inside the panel is about to unmount, so focus lands
  // on the bell; a rail or nav click keeps its own focus, which is where the desk just went.
  useEffect(() => {
    if (panelRef.current?.contains(document.activeElement)) bellRef.current?.focus();
    setOpen(false);
  }, [pathname]);

  // The panel covers the page while it is open, so the page behind it must not scroll. The cleanup
  // runs on every close path, including a navigation, so the lock can never outlive the panel.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

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

  function markLocally(ids: string[]) {
    setLocalRead((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function broadcastRead(storedIds: string[], localIds: string[]) {
    readChannel.current?.postMessage({ storedIds, localIds });
  }

  /**
   * Marks one alert read. A stored row gets a per-user read row so the mark survives a refresh; a
   * live info item has no row, so the mark is local and goes when the issue does. Live blocking
   * and warning items never reach here: they clear only when the cause is fixed.
   */
  async function markRead(alert: Alert) {
    if (alert.read || !canMarkRead(alert)) return;
    const notificationId = storedIdOf(alert);
    if (!notificationId || !connected || !tournamentId) {
      markLocally([alert.id]);
      broadcastRead([], [alert.id]);
      return;
    }
    // Move it out of the unread list now. The database write follows; a failure puts the row back
    // and reports the error, so the panel never claims a read that did not persist.
    setStored((current) =>
      current.map((row) => (row.id === notificationId ? { ...row, read: true } : row)),
    );
    try {
      await markNotificationRead(createSupabaseBrowserClient(), notificationId);
      broadcastRead([notificationId], []);
    } catch {
      setStored((current) =>
        current.map((row) => (row.id === notificationId ? { ...row, read: false } : row)),
      );
      setSync("error");
    }
  }

  /** Marks every alert that can be read. Live blocking and warning issues are left alone. */
  async function markAllRead() {
    const targets = alerts.filter(isUnreadMarkable);
    if (targets.length === 0) return;
    const localIds = targets.filter((alert) => storedIdOf(alert) === null).map((alert) => alert.id);
    const storedIds = targets.map(storedIdOf).filter((id): id is string => id !== null);
    const hasStored = storedIds.length > 0;
    if (hasStored && connected && tournamentId) {
      const previous = stored;
      setStored((current) => current.map((row) => ({ ...row, read: true })));
      try {
        await markNotificationsRead(createSupabaseBrowserClient(), tournamentId);
      } catch {
        setStored(previous);
        setSync("error");
        return;
      }
    }
    if (localIds.length > 0) markLocally(localIds);
    broadcastRead(storedIds, localIds);
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
          className="on-surface fixed inset-x-0 top-[84px] bottom-0 z-50 overflow-y-auto bg-surface p-4 shadow-card lg:absolute lg:inset-auto lg:top-14 lg:right-0 lg:max-h-[70vh] lg:w-[26rem] lg:rounded-[14px] lg:border lg:border-line lg:p-3"
        >
          <div className="flex items-center justify-between gap-2 pb-2">
            <b className="text-[15px]">Alerts</b>
            <div className="flex items-center gap-1">
              {markable > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => void markAllRead()}>
                  <Check aria-hidden="true" /> Mark all as read
                </Button>
              )}
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

          {showsAllClear(sync, count) && (
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
                <div
                  key={alert.id}
                  className="grid gap-1 rounded-[10px] border border-line px-3 py-2"
                >
                  <Link
                    href={alert.href}
                    onClick={() => {
                      // The panel link is about to unmount, so without this focus falls to the page
                      // body. The bell stays in the shell on every desk screen.
                      setOpen(false);
                      bellRef.current?.focus();
                    }}
                    className="grid min-h-11 gap-0.5 no-underline"
                  >
                    <b className="text-[14px] text-ink">{alert.title}</b>
                    {alert.detail && <span className="hint">{alert.detail}</span>}
                    <span className="text-[12px] font-semibold text-link">Fix</span>
                  </Link>
                  {alert.read ? (
                    <span className="hint inline-flex items-center gap-1">
                      <Check className="size-3.5" aria-hidden="true" /> Read
                    </span>
                  ) : canMarkRead(alert) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="justify-self-start"
                      onClick={() => void markRead(alert)}
                    >
                      Mark as read
                    </Button>
                  ) : (
                    <span className="hint">Stays until the problem is fixed.</span>
                  )}
                </div>
              ))}
            </section>
          ))}

          {read.length > 0 && (
            <details className="mt-2 border-t border-line pt-2" data-testid="alerts-read">
              <summary className="cursor-pointer text-[13px] font-semibold text-ink-muted">
                Read ({read.length})
              </summary>
              <div className="mt-2 grid gap-1.5">
                {read.map((alert) => (
                  <div
                    key={alert.id}
                    className="grid gap-1 rounded-[10px] border border-line px-3 py-2 opacity-70"
                  >
                    <Link
                      href={alert.href}
                      onClick={() => {
                        setOpen(false);
                        bellRef.current?.focus();
                      }}
                      className="grid gap-0.5 no-underline"
                    >
                      <b className="text-[14px] text-ink">{alert.title}</b>
                      {alert.detail && <span className="hint">{alert.detail}</span>}
                    </Link>
                    <span className="hint inline-flex items-center gap-1">
                      <Check className="size-3.5" aria-hidden="true" /> Read
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {markable > 0 && (
            <p className="hint border-t border-line pt-2">
              Read marks are per person. Info notices leave the badge when read. Blocking and
              warning items stay in the badge until the cause is fixed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
