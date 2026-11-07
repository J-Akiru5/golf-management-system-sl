"use client";

import { CircleUserRound, LogIn, Trophy, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutForm } from "@/components/SignOutForm";
import { fmtDayDate } from "@/lib/staff/day";
import { APP_VERSION_LABEL } from "@/lib/version";
import { useDesk } from "@/lib/store/desk-store";
import { BottomSheet } from "./BottomSheet";
import styles from "./staff.module.css";

const ROLE_LABEL: Record<"owner" | "organizer" | "desk", string> = {
  owner: "Owner",
  organizer: "Organizer",
  desk: "Desk volunteer",
};

const ROLE_CAN: Record<"owner" | "organizer" | "desk", string> = {
  owner:
    "Everything, including moving players, publishing the draw and changing event settings.",
  organizer:
    "Everything, including moving players, publishing the draw and changing event settings.",
  desk: "Record arrivals, add a walk-up, find a player and print. Organizers move players and publish the draw.",
};

/**
 * Who this phone belongs to, the event in view, and the way out. The header's account button opens
 * it. Nothing in here changes the guards: it shows what the account may already do and explains the
 * parts it may not, so a desk volunteer is not left guessing why a control is missing.
 */
export function AccountSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    member,
    club,
    tournament,
    tournaments,
    dispatch,
    status,
    offline,
    cachedAt,
    error,
  } = useDesk();
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);

  const signedIn = Boolean(member);
  const role = member?.role ?? null;
  const manager = role === "owner" || role === "organizer";
  const firstDate = tournament?.dates[0];
  const lastDate = tournament?.dates.at(-1);
  const savedAt = cachedAt
    ? new Date(cachedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Account"
      description={`${club.shortName || club.name} · Staff app`}
    >
      <div className={styles.accountIdentity}>
        <span className={styles.accountAvatar} aria-hidden="true">
          <CircleUserRound size={26} />
        </span>
        <span className={styles.accountText}>
          <b>{member?.displayName?.trim() || (status === "demo" ? "Demo staff" : "Staff")}</b>
          <span>{role ? ROLE_LABEL[role] : status === "demo" ? "No sign-in in demo mode" : "Not signed in"}</span>
        </span>
      </div>

      {status === "demo" && (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          <b>Demo mode.</b> These are sample players and sample times. Nothing is saved and there is
          no server, so every screen is safe to try.
        </p>
      )}

      {offline && (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          <WifiOff size={16} aria-hidden="true" /> You are offline.
          {savedAt ? ` Showing the copy saved at ${savedAt}.` : ""} Arrivals and other changes need
          a connection; they are not queued.
        </p>
      )}

      {error && !offline && (
        <p className={`${styles.notice} ${styles.noticeBad}`}>
          The desk reported: {error}
        </p>
      )}

      <section className={styles.accountSection} aria-labelledby="account-event">
        <h2 id="account-event" className={styles.accountSectionHead}>
          <Trophy size={16} aria-hidden="true" /> Event in view
        </h2>
        <p className={styles.accountEvent}>{tournament?.name ?? "No event selected"}</p>
        {tournament && (
          <p className={styles.accountHint}>
            {firstDate && lastDate
              ? firstDate === lastDate
                ? fmtDayDate(firstDate)
                : `${fmtDayDate(firstDate)} to ${fmtDayDate(lastDate)}`
              : "Dates not set"}
          </p>
        )}

        {tournaments.length > 1 ? (
          switching ? (
            <div className={styles.accountEventList} role="group" aria-label="Switch event">
              {tournaments.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={styles.accountEventButton}
                  aria-pressed={event.id === tournament?.id}
                  onClick={() => {
                    dispatch({ type: "selectTournament", id: event.id });
                    setSwitching(false);
                    onOpenChange(false);
                  }}
                >
                  <b>{event.name}</b>
                  <span>{event.id === tournament?.id ? "Showing now" : "Switch to this event"}</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setSwitching(true)}
            >
              Switch event
            </button>
          )
        ) : (
          <p className={styles.accountHint}>Only one event is on this phone.</p>
        )}
      </section>

      <section className={styles.accountSection} aria-labelledby="account-role">
        <h2 id="account-role" className={styles.accountSectionHead}>
          What this account can do
        </h2>
        <p className={styles.accountHint}>
          {role
            ? ROLE_CAN[role]
            : status === "demo"
              ? "In the real app a desk volunteer records arrivals, adds walk-ups and prints. Owners and organizers also move players and publish the draw."
              : "Sign in with a staff account to record arrivals and score."}
        </p>
        {manager && (
          <Link className={styles.accountLink} href="/admin">
            Open the full desk
          </Link>
        )}
        {!manager && role && (
          <p className={styles.accountHint}>
            The full desk is for owners and organizers. Ask one of them for a change this screen
            cannot make.
          </p>
        )}
      </section>

      {signedIn && <SignOutForm className={styles.secondary} label="Sign out" />}

      {!signedIn && status !== "demo" && (
        <Link className={styles.accountLink} href={`/login?next=${encodeURIComponent(pathname)}`}>
          <LogIn size={18} aria-hidden="true" /> Sign in again
        </Link>
      )}

      <p className={styles.accountVersion}>{APP_VERSION_LABEL}</p>
    </BottomSheet>
  );
}
