"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BottomSheet } from "./BottomSheet";
import styles from "./staff.module.css";

/**
 * A session that ended while the phone was open. Nothing is thrown away: the screen stays exactly
 * as it was, and this sheet explains that saving has stopped and offers the one action that fixes
 * it. Signing in returns to this same page.
 */
export function SignInSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const next = encodeURIComponent(pathname || "/staff");

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Your sign-in has ended"
      description="The staff app can still show what was on screen, but it cannot save a change until you sign in again."
    >
      <p className={styles.notice}>
        Nothing on this phone was sent. After signing in you come back to this same screen.
      </p>
      <div className={styles.buttonRow}>
        <Link className={styles.primary} href={`/login?next=${next}`}>
          <LogIn size={20} aria-hidden="true" /> Sign in again
        </Link>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => onOpenChange(false)}
        >
          Keep looking at this screen
        </button>
      </div>
    </BottomSheet>
  );
}
