"use client";

import { CircleUserRound, PencilLine } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, StatusPill } from "@/components/bits";
import { fmtHcp, fmtIndex, photoOf } from "@/lib/format";
import { cn } from "@/lib/ui/cn";
import { addedByLabel, paymentLabel } from "./logic";
import type { PaymentStatus, RegistrationAudit, RegistrationStatus } from "./types";

export interface RegisteredByProps {
  /** Display name of the member who took the registration. Optional: the column may not exist. */
  name?: string | null;
  /** ISO timestamp. Optional for the same reason. */
  at?: string | null;
  /** Injected in tests and the preview so the label is stable. */
  now?: Date;
  className?: string;
}

/**
 * "Added by Ana Reyes at 2:05 PM". Renders nothing when neither fact is known, so a row built
 * before the audit columns exist simply shows no chip.
 */
export function RegisteredBy({ name, at, now, className }: RegisteredByProps) {
  const label = addedByLabel({ addedByName: name, addedAt: at }, now);
  if (label === null) return null;
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-md bg-surface-sunken px-2 py-0.5 text-[12px] text-ink-muted",
        className,
      )}
    >
      <CircleUserRound className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

export interface OverriddenBadgeProps {
  /** Why the organizer changed it by hand. Shown on hover and to screen readers. */
  reason?: string | null;
  className?: string;
}

/** A hand-changed registration: the router never produces this on its own. */
export function OverriddenBadge({ reason, className }: OverriddenBadgeProps) {
  const detail = reason?.trim();
  return (
    <span
      className={cn("pill gold", className)}
      title={detail ? `Changed by hand: ${detail}` : "Changed by hand"}
      aria-label={detail ? `Overridden: ${detail}` : "Overridden by hand"}
    >
      <PencilLine className="size-3" aria-hidden="true" />
      Overridden
    </span>
  );
}

export interface RegistrationRowProps {
  name: string;
  /** Consent is checked by the component: a photo without consent is never shown. */
  photo?: string;
  photoConsent?: boolean;
  role?: "member" | "guest";
  status?: RegistrationStatus | null;
  /** The frozen index for the event, when the desk has one. */
  index?: number | null;
  playingHandicap?: number | null;
  flightName?: string | null;
  paymentStatus?: PaymentStatus | null;
  shirt?: string | null;
  /** The selected playing days, already summarised, e.g. "Days 1, 2". */
  daysNote?: string | null;
  /** E.g. "prefers 6:30 AM" summary the assembler builds from the entry. */
  teePreferenceNote?: string | null;
  /** Added by / at / overridden. All optional. */
  audit?: RegistrationAudit;
  /** When provided the name becomes a link to the profile. */
  profileHref?: string;
  /** Row actions (re-freeze, remove, …) supplied by the screen. */
  actions?: ReactNode;
  now?: Date;
  className?: string;
}

/**
 * One registration in a list: who, what role, where they landed, how they pay, who took the entry
 * and whether it was changed by hand. Everything except the name is optional, so the row works
 * before the audit and payment columns exist.
 */
export function RegistrationRow({
  name,
  photo,
  photoConsent,
  role = "member",
  status = null,
  index = null,
  playingHandicap = null,
  flightName = null,
  paymentStatus = null,
  shirt = null,
  daysNote = null,
  teePreferenceNote = null,
  audit,
  profileHref,
  actions,
  now,
  className,
}: RegistrationRowProps) {
  const photoUrl = photoOf({ photo, photoConsent });
  const meta = [
    index !== null ? `Index ${fmtIndex(index)}` : null,
    playingHandicap !== null ? `PH ${fmtHcp(playingHandicap)}` : null,
    flightName ? flightName : null,
  ].filter((part): part is string => part !== null);
  const secondary = [
    shirt ? `shirt ${shirt}` : null,
    daysNote ? daysNote : null,
    paymentStatus ? `Payment: ${paymentLabel(paymentStatus)}` : null,
    teePreferenceNote ?? null,
  ].filter((part): part is string => part !== null);

  return (
    <article
      className={cn(
        "grid gap-2 rounded-[12px] border border-line p-3 sm:flex sm:items-center sm:gap-3",
        className,
      )}
    >
      <Avatar name={name} photo={photoUrl} />
      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {profileHref ? (
            <Link
              href={profileHref}
              className="truncate font-semibold text-ink no-underline hover:underline"
            >
              {name}
            </Link>
          ) : (
            <b className="truncate font-semibold text-ink">{name}</b>
          )}
          <span className={cn("pill", role === "guest" ? "info" : "")}>
            {role === "guest" ? "Guest" : "Member"}
          </span>
          {status && <StatusPill status={status} />}
          {audit?.overridden && <OverriddenBadge reason={audit.overrideReason} />}
        </span>
        {meta.length > 0 && <span className="hint mt-0.5 block truncate">{meta.join(" · ")}</span>}
        {secondary.length > 0 && (
          <span className="hint block truncate">{secondary.join(" · ")}</span>
        )}
        {audit && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <RegisteredBy name={audit.addedByName} at={audit.addedAt} now={now} />
          </span>
        )}
      </div>
      {actions && (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-end">
          {actions}
        </span>
      )}
    </article>
  );
}
