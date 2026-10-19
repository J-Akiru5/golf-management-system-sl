"use client";

import { WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { DataStatusBanner, SessionBar } from "@/components/desk";
import { SignOutForm } from "@/components/SignOutForm";
import { offlineNotice } from "@/lib/offline/cache";
import { useDesk } from "@/lib/store/desk-store";

/**
 * Wires two presentational components to the desk store, once, for every desk screen:
 *
 * - `DataStatusBanner` for the states the organizer must not have to guess: a load in flight, or a
 *   failed read/write with a retry. `ready` renders nothing, so a healthy screen stays quiet. Demo
 *   mode is already announced by the shell badge, so it is not repeated here.
 * - `SessionBar` for who is signed in, their role, whether a write is in flight, and when the last
 *   one landed.
 *
 * On the control room the shell header floats over the course photo, so the strip needs its own
 * band below the header (otherwise it renders underneath it). The header already names the member,
 * so only the load and error banner shows there.
 *
 * Sign-out arrives through `signOutSlot`, because the component itself must not import auth.
 */
export function DeskStatusStrip() {
  const { status, error, saving, member, lastSavedAt, reload, offline, cachedAt } = useDesk();
  const overlay = usePathname() === "/admin";
  const banner =
    status === "loading" ? (
      <DataStatusBanner status="loading" detail={null} />
    ) : status === "error" ? (
      <DataStatusBanner status="error" errorMessage={error} onRetry={reload} />
    ) : null;
  // A saved copy is never allowed to look live. The sentence names the clock time and says the
  // phone is not connected, on every desk screen, because the desk store is shared by all of them.
  const saved = cachedAt ? (
    <div className="notice warn flex flex-wrap items-start gap-2.5" role="status">
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <b>{offlineNotice(cachedAt)}</b>
        <span className="mt-0.5 block text-[13px] text-ink-muted">
          Changes cannot be saved until the connection returns. Nothing is queued.
        </span>
      </span>
      <button type="button" className="btn small shrink-0" onClick={reload}>
        Try again
      </button>
    </div>
  ) : offline ? (
    <p className="notice warn flex items-start gap-2.5" role="status">
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        <b>Not connected.</b> Changes cannot be saved until the connection returns. Nothing is
        queued.
      </span>
    </p>
  ) : null;

  if (overlay) {
    // A failed save has no session bar to land in here, so it gets the same banner.
    const shown =
      banner ??
      saved ??
      (error && !saving ? (
        <DataStatusBanner status="error" errorMessage={error} onRetry={reload} />
      ) : null);
    if (!shown) return null;
    // Forest, not the page surface: the header's logo is ivory and would vanish on a light page.
    return (
      <div className="bg-forest px-4 pt-[100px] pb-3 sm:px-6 lg:pr-6 lg:pl-[112px]">{shown}</div>
    );
  }

  return (
    <div className="mb-4 grid gap-2">
      {banner}
      {saved}
      {/* While the desk is loading or failed to load, the banner is the truth: a session bar
          saying "demo" or "not signed in" next to it would contradict it. */}
      {status !== "loading" && status !== "error" && (
        <SessionBar
          member={member}
          saving={saving}
          error={saving ? null : error}
          lastSavedAt={lastSavedAt}
          onRetry={reload}
          signOutSlot={
            member === undefined ? undefined : <SignOutForm className="btn small ghost" />
          }
        />
      )}
    </div>
  );
}
