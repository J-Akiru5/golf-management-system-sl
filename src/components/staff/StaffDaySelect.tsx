"use client";

import { useEffect, useState } from "react";
import { DaySelect } from "@/components/ui/DaySelect";
import { fmtDayDate, isoToday, type StaffDay } from "@/lib/staff/day";

/**
 * The event's playing days for the staff app, as the one shared day control.
 *
 * The day state, the auto choice and the "not today" notice stay where they were in
 * `day-context`; this only names the days and marks today. The club's date is read after mount so
 * the server and the phone cannot disagree about what "today" is.
 */
export function StaffDaySelect({
  days,
  selected,
  onSelect,
}: {
  days: readonly StaffDay[];
  selected: number | null;
  onSelect: (dayNumber: number) => void;
}) {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(isoToday(new Date()));
  }, []);

  if (days.length === 0) return null;

  return (
    <div data-onboard="day-pills">
      <DaySelect
        label="Playing day"
        days={days.map((day) => ({
          value: day.number,
          label: `Day ${day.number} · ${fmtDayDate(day.date)}`,
          hint: day.date === today ? "Today" : undefined,
        }))}
        value={selected ?? days[0]?.number ?? 0}
        onChange={(value) => onSelect(Number(value))}
      />
    </div>
  );
}
