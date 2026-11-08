"use client";

import { SESSION_FILTERS, type SessionCounts } from "@/lib/staff/schedule";
import { DayPills } from "./DayPills";
import { useStaffDay } from "./day-context";
import styles from "./staff.module.css";

/**
 * The tee sheet's two switches: the playing day, and the session within it. The counts are the
 * number of groups, so a starter can see at a glance that the afternoon is the busy one.
 */
export function DayBar({ counts }: { counts?: SessionCounts }) {
  const { days, day, setDayNumber, session, setSession } = useStaffDay();

  return (
    <div className={styles.dayBar}>
      <DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />
      <div className={styles.sessionBar} role="group" aria-label="Session">
        {SESSION_FILTERS.map((item) => {
          const count =
            counts === undefined
              ? null
              : item.key === "all"
                ? counts.am + counts.pm + counts.unset
                : item.key === "AM"
                  ? counts.am
                  : counts.pm;
          return (
            <button
              key={item.key}
              type="button"
              className={styles.sessionChip}
              aria-pressed={session === item.key}
              onClick={() => setSession(item.key)}
            >
              <span>{item.label}</span>
              {count !== null && <small>{count}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
