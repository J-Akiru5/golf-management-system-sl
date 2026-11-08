"use client";

import { CalendarDays, ClipboardList, Flag, Home, RefreshCw, Users, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { accessProblemCopy } from "@/lib/auth/access-problem";
import { isStaffCurrent, STAFF_NAV, type StaffIcon } from "@/lib/staff/nav";
import { useDesk } from "@/lib/store/desk-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AccountSheet } from "./AccountSheet";
import { StaffDayProvider } from "./day-context";
import { SignInSheet } from "./SignInSheet";
import { StaffToastProvider } from "./StaffToast";
import styles from "./staff.module.css";

const ICONS: Record<StaffIcon, typeof Home> = {
  home: Home,
  users: Users,
  flag: Flag,
  clipboard: ClipboardList,
};

function initialsOf(name: string | undefined): string {
  if (!name?.trim()) return "";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The staff app's frame: a small forest header with the event and the account, and the four
 * destinations in a bar a thumb can reach. There is no drawer, no rail and no settings: this app is
 * for the people who check players in and walk a group, and everything else is one link away inside
 * the account sheet.
 */
export function StaffShell({ children }: { children: ReactNode }) {
  const { club, tournament, member, status, accessProblem, offline, cachedAt, reload } = useDesk();
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const [signInDismissed, setSignInDismissed] = useState(false);

  const connected = isSupabaseConfigured();
  const signInNeeded =
    connected && status === "error" && member === undefined && accessProblem === null;
  const savedAt = cachedAt
    ? new Date(cachedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })
    : null;
  const initials = initialsOf(member?.displayName);
  const access = accessProblem ? accessProblemCopy(accessProblem) : null;

  // A fresh sign-in makes the sheet relevant again next time the session ends.
  useEffect(() => {
    if (status === "ready") setSignInDismissed(false);
  }, [status]);

  return (
    <StaffDayProvider>
      <StaffToastProvider>
        <div className={styles.shell}>
          {/* The same top bar as the organizer desk and the player app, so the three areas feel
              like one product. The account chip opens the staff account sheet. */}
          <AppTopBar
            homeHref="/staff"
            title={club.shortName || club.name}
            subtitle={`${tournament?.name ?? "No event selected"} · Staff`}
            help={{ audience: "desk", screen: "/staff" }}
            account={{
              label: "Account and event",
              initials: initials || undefined,
              onClick: () => setAccountOpen(true),
              dataOnboard: "account-sheet",
            }}
          />

          {status === "demo" && (
            <p className={styles.demoStrip}>
              Demo mode · sample players and times · nothing is saved
            </p>
          )}

          {offline && (
            <div className={styles.offlineBanner} role="status">
              <WifiOff size={16} aria-hidden="true" />
              <span>
                Offline. Showing what was on screen
                {savedAt ? ` at ${savedAt}` : ""}. Changes need a connection and are not queued.
              </span>
              <button type="button" className={styles.offlineRetry} onClick={reload}>
                <RefreshCw size={14} aria-hidden="true" /> Try again
              </button>
            </div>
          )}

          {access && (
            <div className={styles.shellAlert} role="alert">
              <b>{access.title}.</b> {access.body} {access.next}
            </div>
          )}

          <main id="main" className={styles.main}>
            {children}
          </main>

          <nav className={styles.bar} aria-label="Staff app">
            {STAFF_NAV.map((item) => {
              const Icon = ICONS[item.icon];
              const current = isStaffCurrent(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={styles.barItem}
                  data-testid={item.testId}
                  aria-current={current ? "page" : undefined}
                >
                  <Icon aria-hidden="true" size={22} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} />
        <SignInSheet
          open={signInNeeded && !signInDismissed}
          onOpenChange={(open) => {
            if (!open) setSignInDismissed(true);
          }}
        />
      </StaffToastProvider>
    </StaffDayProvider>
  );
}

/** A day header shared by every staff page: the title, the day pills and the "not today" notice. */
export function staffDayIcon() {
  return CalendarDays;
}
