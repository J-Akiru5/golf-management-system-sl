"use client";

import { useRef, useState } from "react";
import { signOut } from "@/lib/auth/actions";
import { clearOfflineData } from "@/lib/offline/store";

/**
 * Sign-out that clears the phone before it leaves.
 *
 * The snapshots hold player names, handicap indexes and phone numbers. On a shared phone they must
 * not outlive the session, so the clear is awaited and only then is the server action submitted.
 * The status text says what is happening; a sign-out that silently took two seconds looked broken.
 */
export function SignOutForm({
  className,
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const clearing = useRef(false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      ref={form}
      action={signOut}
      onSubmit={(event) => {
        // The second submit is the real one, after storage is clear.
        if (clearing.current) return;
        event.preventDefault();
        clearing.current = true;
        setBusy(true);
        void clearOfflineData().finally(() => form.current?.requestSubmit());
      }}
    >
      <button type="submit" className={className} disabled={busy}>
        {busy ? "Signing out…" : label}
      </button>
    </form>
  );
}
