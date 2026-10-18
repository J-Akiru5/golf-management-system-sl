"use client";

import { usePathname } from "next/navigation";
import { DataStatusBanner, SessionBar } from "@/components/desk";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
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
  const { status, error, saving, member, lastSavedAt, reload } = useDesk();
  const overlay = usePathname() === "/admin";
  const banner =
    status === "loading" ? (
      <DataStatusBanner status="loading" detail={null} />
    ) : status === "error" ? (
      <DataStatusBanner status="error" errorMessage={error} onRetry={reload} />
    ) : null;

  if (overlay) {
    // A failed save has no session bar to land in here, so it gets the same banner.
    const shown =
      banner ??
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
            member === undefined ? undefined : (
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            )
          }
        />
      )}
    </div>
  );
}
