"use client";

import { CircleAlert, Database, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import type { DataStatus } from "./types";

/** The badge text the whole app uses for session-only demo data. Keep it in one place. */
export const DEMO_DATA_NOTICE = "Demo shell · local session data";

export interface DataStatusBannerProps {
  /** "ready" renders nothing: a screen that is fine should say nothing. */
  status: DataStatus;
  /** Shown in the error state, above the retry. */
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Extra line, e.g. the detail about what is and is not connected. */
  detail?: ReactNode;
  /** "banner" is a full-width strip; "inline" is a compact single line for tight headers. */
  variant?: "banner" | "inline";
  className?: string;
}

const DEMO_DETAIL =
  "Players, events and tee ratings on screen are samples. Nothing is saved to a server and a refresh clears the session.";

/**
 * One place for the truth about the data behind a screen: demo (session only), loading, or failed
 * with a retry. Screens render it at the top of their content so the organizer never has to guess
 * whether a change was written, or why the desk is empty.
 */
export function DataStatusBanner({
  status,
  errorMessage,
  onRetry,
  detail,
  variant = "banner",
  className,
}: DataStatusBannerProps) {
  if (status === "ready") return null;

  const inline = variant === "inline";
  const shell = cn(
    "flex items-start gap-2.5",
    inline ? "flex-wrap items-center text-[13px]" : "text-[14px]",
    className,
  );

  if (status === "demo") {
    return (
      <div className={cn(shell, inline ? "py-0.5" : "notice")} role="note">
        <Database
          className={cn("size-4 shrink-0", inline ? "mt-0" : "mt-0.5", "text-gold-ink")}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <b>{DEMO_DATA_NOTICE}</b>
          {inline ? (
            detail ? (
              <span className="text-ink-muted"> · {detail}</span>
            ) : null
          ) : (
            <span className="mt-0.5 block text-ink-muted">{detail ?? DEMO_DETAIL}</span>
          )}
        </span>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className={cn(shell, inline ? "py-0.5" : "notice")} role="status" aria-live="polite">
        <RefreshCw
          className={cn("size-4 shrink-0 animate-spin text-ink-muted", !inline && "mt-0.5")}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <b>Loading tournament data…</b>
          {!inline && detail ? <span className="mt-0.5 block text-ink-muted">{detail}</span> : null}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(shell, inline ? "py-0.5" : "notice bad")} role="alert">
      <TriangleAlert
        className={cn("size-4 shrink-0 text-danger", !inline && "mt-0.5")}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <b>{errorMessage?.trim() || "Could not load the desk data."}</b>
        {!inline && detail && <span className="mt-0.5 block text-ink-muted">{detail}</span>}
      </span>
      {onRetry && (
        <button type="button" className="btn small shrink-0" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * A one-line honesty note for screens that write: says where the data went, or that it went
 * nowhere. Separate from the banner so a screen can use both.
 */
export function SaveTruth({
  target,
  detail,
  className,
}: {
  target: "session" | "database";
  detail?: ReactNode;
  className?: string;
}) {
  const Icon = target === "database" ? Database : CircleAlert;
  return (
    <p className={cn("flex items-start gap-2 text-[13px] text-ink-muted", className)} role="note">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {target === "database" ? (
          <>
            <b>Saved to the club database.</b> {detail ?? "Changes are kept when the page reloads."}
          </>
        ) : (
          <>
            <b>{DEMO_DATA_NOTICE}.</b> {detail ?? "This change lives in the browser session only."}
          </>
        )}
      </span>
    </p>
  );
}
