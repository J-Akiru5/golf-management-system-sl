"use client";

import { fmtDayDate, type StaffDay } from "@/lib/staff/day";
import styles from "./staff.module.css";

/** The event's playing days as pills. One is always chosen; the rest are one tap away. */
export function DayPills({
  days,
  selected,
  onSelect,
}: {
  days: readonly StaffDay[];
  selected: number | null;
  onSelect: (dayNumber: number) => void;
}) {
  if (days.length === 0) return null;
  return (
    <div className={styles.dayPills} role="group" aria-label="Playing day" data-onboard="day-pills">
      {days.map((day) => (
        <button
          key={day.number}
          type="button"
          className={styles.dayPill}
          data-day={day.number}
          aria-pressed={day.number === selected}
          onClick={() => onSelect(day.number)}
        >
          <b>Day {day.number}</b>
          <span>{fmtDayDate(day.date)}</span>
        </button>
      ))}
    </div>
  );
}
