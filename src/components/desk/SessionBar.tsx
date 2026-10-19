"use client";

import { CircleUserRound, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { lastSavedLabel, roleLabel } from "./logic";
import type { DeskRole } from "./types";

export interface SessionBarProps {
  /**
   * Who is signed in. Three states, on purpose:
   *   undefined -> auth is not configured in this build (demo), so no sign-in is implied;
   *   null      -> signed out / no membership row;
   *   object    -> the signed-in member and role.
   */
  member?: { displayName: string; role: DeskRole } | null;
  /** ISO timestamp of the last successful write. */
  lastSavedAt?: string | null;
  saving?: boolean;
  /** Last write error; shown with a retry when the screen can offer one. */
  error?: string | null;
  onRetry?: () => void;
  /** The assembler drops the sign-out form (server action) in here. */
  signOutSlot?: ReactNode;
  /** Injected in tests and the preview so labels are stable. */
  now?: Date;
  className?: string;
}

/**
 * The desk session bar: who is signed in, what role, and how the last save went. Every prop is
 * optional so it renders in demo mode, in a signed-out state, and under a real member without
 * changing shape. It never imports auth: the sign-out control arrives through `signOutSlot`.
 */
export function SessionBar({
  member,
  lastSavedAt,
  saving = false,
  error,
  onRetry,
  signOutSlot,
  now,
  className,
}: SessionBarProps) {
  const badge = roleLabel(member?.role);
  const memberLabel =
    member === undefined
      ? "Demo session · no sign-in in this build"
      : member === null
        ? "Not signed in"
        : member.displayName;

  return (
    <section
      aria-label="Session"
      className={cn(
        "flex flex-col gap-2 rounded-[12px] border border-line bg-surface-raised px-3.5 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fairway-soft text-fairway">
          <CircleUserRound className="size-4" aria-hidden="true" />
        </span>
        <b className="min-w-0 truncate text-[14px]">{memberLabel}</b>
        {badge && <span className="pill gold">{badge}</span>}
        {member === null && <span className="pill warn">No membership</span>}
      </span>

      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:flex-1 sm:justify-end">
        {saving && (
          <span
            className="flex items-center gap-1.5 text-[13px] text-ink-muted"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Saving…
          </span>
        )}

        {!saving && error && (
          <span className="flex flex-wrap items-center gap-2" role="alert">
            <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
            <span className="text-[13px] text-danger">{error}</span>
            {onRetry && (
              <button type="button" className="btn small" onClick={onRetry}>
                <RefreshCw aria-hidden="true" />
                Retry
              </button>
            )}
          </span>
        )}

        {!saving && !error && (
          <span
            className="text-[13px] text-ink-muted"
            role="status"
            aria-live="polite"
            title={lastSavedAt ?? undefined}
          >
            {lastSavedLabel(lastSavedAt, now)}
          </span>
        )}

        {signOutSlot && <span className="shrink-0">{signOutSlot}</span>}
      </span>
    </section>
  );
}
