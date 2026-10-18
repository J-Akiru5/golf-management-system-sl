"use client";

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
 * Sign-out arrives through `signOutSlot`, because the component itself must not import auth.
 */
export function DeskStatusStrip() {
  const { status, error, saving, member, lastSavedAt, reload } = useDesk();

  return (
    <div className="grid gap-2">
      {status === "loading" && <DataStatusBanner status="loading" detail={null} />}
      {status === "error" && (
        <DataStatusBanner status="error" errorMessage={error} onRetry={reload} />
      )}
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
    </div>
  );
}
