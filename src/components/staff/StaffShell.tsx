"use client";

import { CalendarDays, ClipboardList, Flag, Home, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isStaffCurrent, STAFF_NAV, type StaffIcon } from "@/lib/staff/nav";
import { useDesk } from "@/lib/store/desk-store";
import { StaffDayProvider } from "./day-context";
import styles from "./staff.module.css";

const ICONS: Record<StaffIcon, typeof Home> = {
  home: Home,
  users: Users,
  flag: Flag,
  clipboard: ClipboardList,
};

/**
 * The staff app's frame: a small forest header with the event, the page, and the four destinations
 * in a bar a thumb can reach. There is no drawer, no rail and no settings: this app is for the
 * people who check players in and walk a group, and everything else is one link away on the desk.
 */
export function StaffShell({ children }: { children: ReactNode }) {
  const { club, tournament, member } = useDesk();
  const pathname = usePathname();
  const manager = !member || member.role === "owner" || member.role === "organizer";

  return (
    <StaffDayProvider>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <b>{club.shortName || club.name}</b>
            <span>{tournament?.name ?? "No event selected"} · Staff</span>
          </div>
          {manager && (
            <Link className={styles.headerLink} href="/admin">
              Full desk
            </Link>
          )}
        </header>

        <main className={styles.main}>{children}</main>

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
    </StaffDayProvider>
  );
}

/** A day header shared by every staff page: the title, the day pills and the "not today" notice. */
export function staffDayIcon() {
  return CalendarDays;
}
