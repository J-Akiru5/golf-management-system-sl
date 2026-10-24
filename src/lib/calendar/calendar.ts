import type { Tournament, TournamentDay } from "@/lib/data/types";

export interface CalendarEvent {
  id: string;
  name: string;
  hostName?: string | null;
  courseId: string;
  status: Tournament["state"];
  dates: string[];
  days: Pick<TournamentDay, "playDate" | "startTime" | "label">[];
  logoUrl?: string;
}

export interface CalendarConflict {
  firstId: string;
  secondId: string;
  date: string;
  kind: "exact" | "same-day";
  detail: string;
}

export function calendarEvent(tournament: Tournament): CalendarEvent {
  return {
    id: tournament.id,
    name: tournament.name,
    hostName: tournament.hostName,
    courseId: tournament.courseId,
    status: tournament.state,
    dates: tournament.dates,
    days: tournament.days?.length
      ? tournament.days.map((day) => ({
          playDate: day.playDate,
          startTime: day.startTime,
          label: day.label,
        }))
      : tournament.dates.map((date, index) => ({
          playDate: date,
          startTime: index === 0 ? tournament.config.firstTeeTime : null,
          label: `Day ${index + 1}`,
        })),
    logoUrl: tournament.logoUrl,
  };
}

/** A conflict is exact when the course and tee time overlap; same-day is a warning. */
export function findCalendarConflicts(events: readonly CalendarEvent[]): CalendarConflict[] {
  const conflicts: CalendarConflict[] = [];
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const first = events[i];
      const second = events[j];
      if (!first || !second || first.courseId !== second.courseId) continue;
      const dates = new Set(first.days.map((day) => day.playDate));
      for (const day of second.days) {
        if (!dates.has(day.playDate)) continue;
        const other = first.days.find((item) => item.playDate === day.playDate);
        if (!other) continue;
        const exact =
          other.startTime !== null && day.startTime !== null && other.startTime === day.startTime;
        conflicts.push({
          firstId: first.id,
          secondId: second.id,
          date: day.playDate,
          kind: exact ? "exact" : "same-day",
          detail: exact
            ? `${first.name} and ${second.name} both start at ${day.startTime} on ${day.playDate}.`
            : `${first.name} and ${second.name} are both on ${day.playDate}. Times differ or are not set.`,
        });
      }
    }
  }
  return conflicts;
}

export function eventsOnDate(events: readonly CalendarEvent[], date: string): CalendarEvent[] {
  return events
    .filter((event) => event.days.some((day) => day.playDate === date))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface MonthCell {
  date: string;
  inMonth: boolean;
}

/** Six Sunday-first weeks, using UTC so a local timezone cannot shift an ISO date. */
export function monthCells(year: number, month: number): MonthCell[] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      inMonth: date.getUTCMonth() === month,
    };
  });
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthOf(date: string): { year: number; month: number } {
  const [year, month] = date.split("-").map(Number);
  return { year: year ?? 0, month: (month ?? 1) - 1 };
}
