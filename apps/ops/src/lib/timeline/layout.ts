import {
  addDays,
  addMonths,
  daysBetween,
  endOfMonth,
  endOfWeek,
  formatDay,
  formatMonthYear,
  MONTHS_SHORT,
  parseDay,
  startOfMonth,
  startOfWeek,
} from "./dates";
import { compareItems, PREP_DAYS } from "./items";
import type { TimelineItem, TimelineKind } from "./types";
import { TIMELINE_KINDS } from "./types";

/**
 * The Gantt layout: a day-numbered window, a set of axis columns, and one row per item.
 *
 * Positions are percentages of the window, so the same numbers work at any pixel width and the
 * track can still be given a minimum width and scrolled sideways. Everything is pure and tested:
 * bar positions, the prep window, and which rows overlap.
 */

export type GanttZoom = "week" | "month";

export type GanttWindow = {
  /** First day shown, inclusive. */
  from: string;
  /** Last day shown, inclusive. */
  to: string;
  /** Number of days in the window, so a bar can be placed with one division. */
  days: number;
};

export type GanttColumn = {
  key: string;
  label: string;
  from: string;
  to: string;
  days: number;
  /** Share of the window's width. */
  widthPct: number;
};

export type GanttMonthSpan = {
  key: string;
  label: string;
  from: string;
  to: string;
  widthPct: number;
};

export type BarGeometry = { leftPct: number; widthPct: number };

export type GanttBar = {
  item: TimelineItem;
  /** 0 is the first row of the group. Items that share a lane never overlap. */
  lane: number;
  /** The item's own days, clipped to the window. */
  play: BarGeometry;
  /** A tournament's preparation window, clipped to the window. Null when there is none. */
  prep: BarGeometry | null;
};

export type GanttGroup = {
  kind: TimelineKind;
  lanes: number;
  bars: GanttBar[];
};

/** Months a month-zoomed window always shows. */
export const GANTT_MIN_MONTHS = 6;
/** Weeks a week-zoomed window always shows. */
export const GANTT_MIN_WEEKS = 8;

function requireDay(day: string): void {
  if (parseDay(day) === null) throw new Error(`Not a day: ${day}`);
}

/** The day the item's drawing starts: the prep window when it has one. */
export function visibleStart(item: TimelineItem): string {
  return item.prepStart !== null && item.prepStart < item.start ? item.prepStart : item.start;
}

/**
 * The window to draw. It always covers today and every item, and it is at least
 * `GANTT_MIN_MONTHS` months or `GANTT_MIN_WEEKS` weeks wide, so a single item does not produce a
 * window squeezed to a few days.
 */
export function ganttWindow(
  items: ReadonlyArray<TimelineItem>,
  today: string,
  zoom: GanttZoom,
): GanttWindow {
  requireDay(today);

  let earliest = today;
  let latest = today;
  for (const item of items) {
    const start = visibleStart(item);
    if (start < earliest) earliest = start;
    if (item.end > latest) latest = item.end;
  }

  let from: string;
  let to: string;

  if (zoom === "month") {
    from = startOfMonth(earliest);
    to = endOfMonth(latest);
    const minimum = addDays(addMonths(from, GANTT_MIN_MONTHS), -1);
    if (to < minimum) to = endOfMonth(minimum);
  } else {
    from = startOfWeek(earliest);
    to = endOfWeek(latest);
    const minimum = addDays(from, GANTT_MIN_WEEKS * 7 - 1);
    if (to < minimum) to = endOfWeek(minimum);
  }

  return { from, to, days: daysBetween(from, to) + 1 };
}

function weekLabel(day: string): string {
  const date = parseDay(day);
  if (date === null) return day;
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()] ?? ""}`;
}

/** The axis: one column per week or per month. */
export function ganttColumns(window: GanttWindow, zoom: GanttZoom): GanttColumn[] {
  const columns: GanttColumn[] = [];

  if (zoom === "month") {
    let cursor = startOfMonth(window.from);
    while (cursor <= window.to) {
      const monthEnd = endOfMonth(cursor);
      const columnFrom = cursor < window.from ? window.from : cursor;
      const to = monthEnd > window.to ? window.to : monthEnd;
      const days = daysBetween(columnFrom, to) + 1;
      columns.push({
        key: cursor.slice(0, 7),
        label: `${MONTHS_SHORT[Number(cursor.slice(5, 7)) - 1] ?? ""} ${cursor.slice(0, 4)}`,
        from: columnFrom,
        to,
        days,
        widthPct: (days / window.days) * 100,
      });
      cursor = addDays(monthEnd, 1);
    }
    return columns;
  }

  let cursor = startOfWeek(window.from);
  while (cursor <= window.to) {
    const weekEnd = endOfWeek(cursor);
    const columnFrom = cursor < window.from ? window.from : cursor;
    const to = weekEnd > window.to ? window.to : weekEnd;
    const days = daysBetween(columnFrom, to) + 1;
    columns.push({
      key: cursor,
      label: weekLabel(columnFrom),
      from: columnFrom,
      to,
      days,
      widthPct: (days / window.days) * 100,
    });
    cursor = addDays(weekEnd, 1);
  }
  return columns;
}

/** The month names above the week columns, so a long scroll keeps its bearings. */
export function ganttMonthSpans(window: GanttWindow): GanttMonthSpan[] {
  const spans: GanttMonthSpan[] = [];
  let cursor = startOfMonth(window.from);

  while (cursor <= window.to) {
    const monthEnd = endOfMonth(cursor);
    const from = cursor < window.from ? window.from : cursor;
    const to = monthEnd > window.to ? window.to : monthEnd;
    const days = daysBetween(from, to) + 1;
    spans.push({
      key: cursor.slice(0, 7),
      label: `${MONTHS_SHORT[Number(cursor.slice(5, 7)) - 1] ?? ""} ${cursor.slice(0, 4)}`,
      from,
      to,
      widthPct: (days / window.days) * 100,
    });
    cursor = addDays(monthEnd, 1);
  }

  return spans;
}

/** Where a day range sits in the window, clipped to it. Null when it is entirely outside. */
export function barGeometry(from: string, to: string, window: GanttWindow): BarGeometry | null {
  if (to < window.from || from > window.to) return null;

  const startIndex = Math.max(0, Math.min(window.days - 1, daysBetween(window.from, from)));
  const endIndex = Math.max(startIndex, Math.min(window.days - 1, daysBetween(window.from, to)));
  const widthPct = ((endIndex - startIndex + 1) / window.days) * 100;

  return { leftPct: (startIndex / window.days) * 100, widthPct };
}

/** The today line, or null when today is outside the window. */
export function todayPercent(today: string, window: GanttWindow): number | null {
  const geometry = barGeometry(today, today, window);
  return geometry === null ? null : geometry.leftPct + geometry.widthPct / 2;
}

type Placed = { start: string; end: string };

function overlaps(a: Placed, b: Placed): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * One row per item, grouped by kind. Items whose drawings overlap are stacked into lanes rather
 * than drawn on top of each other; the prep window counts as part of the drawing, because it is
 * drawn.
 */
export function layoutGantt(items: ReadonlyArray<TimelineItem>, window: GanttWindow): GanttGroup[] {
  const groups: GanttGroup[] = [];

  for (const kind of TIMELINE_KINDS) {
    const visible = items.filter(
      (item) => item.kind === kind && item.end >= window.from && visibleStart(item) <= window.to,
    );
    if (visible.length === 0) continue;

    const sorted = visible.slice().sort((a, b) => {
      const startA = visibleStart(a);
      const startB = visibleStart(b);
      if (startA !== startB) return startA < startB ? -1 : 1;
      if (a.end !== b.end) return a.end < b.end ? -1 : 1;
      return compareItems(a, b);
    });

    const laneEnds: Placed[] = [];
    const bars: GanttBar[] = [];

    for (const item of sorted) {
      const play = barGeometry(item.start, item.end, window);
      if (play === null) continue;

      const extent: Placed = { start: visibleStart(item), end: item.end };
      let lane = laneEnds.findIndex((placed) => !overlaps(placed, extent));
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(extent);
      } else {
        laneEnds[lane] = extent;
      }

      const prep =
        item.prepStart !== null && item.prepStart < item.start
          ? barGeometry(item.prepStart, addDays(item.start, -1), window)
          : null;

      bars.push({ item, lane, play, prep });
    }

    if (bars.length === 0) continue;
    groups.push({ kind, lanes: laneEnds.length, bars });
  }

  return groups;
}

/** "12 Jan 2027" for the window's first and last day, used by the chart heading. */
export function formatWindow(window: GanttWindow): string {
  return `${formatDay(window.from)} to ${formatDay(window.to)}`;
}

/** "November 2026", for a month-zoomed heading. */
export function formatWindowMonth(window: GanttWindow): string {
  return formatMonthYear(window.from);
}

/** Exported for the views, so the prep segment and the overlap rule cannot drift. */
export const PREP_WINDOW_DAYS = PREP_DAYS;
