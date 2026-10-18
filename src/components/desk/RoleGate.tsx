"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { isRoleAllowed } from "./logic";
import type { DeskRole } from "./types";

export interface RoleGateProps {
  /**
   * The signed-in role. Three states:
   *   undefined -> auth is not configured (demo), so the gate stays open;
   *   null      -> no membership row, treated as least privilege (closed);
   *   a role    -> checked against `allow`.
   */
  role?: DeskRole | null;
  /** Roles allowed through the gate. */
  allow: DeskRole[];
  /** "hide" removes the control; "disable" keeps it visible but inert. */
  mode?: "hide" | "disable";
  /** Shown on hover and to screen readers when the control is disabled. */
  disabledReason?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Cosmetic role gating for the interface: it hides or disables a control the signed-in role should
 * not use, so the desk does not offer actions that will fail.
 *
 * This is NOT a security control. Anyone can bypass it in the browser, and it does not protect any
 * data. Real enforcement lives on the server: row level security and the club-scoped policies in
 * the database decide what a member may read or write, whatever the interface shows.
 *
 * Demo mode (no auth configured) leaves the gate open on purpose, so the desk remains usable
 * without a sign-in.
 */
export function RoleGate({
  role,
  allow,
  mode = "hide",
  disabledReason = "Not available for your role.",
  children,
  className,
}: RoleGateProps) {
  if (role === undefined) return <>{children}</>;
  if (isRoleAllowed(role, allow)) return <>{children}</>;
  if (mode === "hide") return null;

  return (
    <span className={cn("relative inline-flex", className)}>
      <span
        className="pointer-events-none inline-flex opacity-45 select-none"
        // `inert` keeps keyboard and screen-reader users out as well; older browsers fall back to
        // the pointer-events rule above, which is cosmetic only (see the component comment).
        inert={true}
        aria-disabled="true"
        title={disabledReason}
      >
        {children}
      </span>
      <span className="sr">{disabledReason}</span>
    </span>
  );
}
