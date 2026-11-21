"use client";

import { CalendarRange, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDay, formatDayLong } from "@/lib/timeline/dates";
import { itemDatesLabel, PREP_DAYS } from "@/lib/timeline/items";
import {
  formatWindow,
  type GanttBar,
  type GanttZoom,
  ganttColumns,
  ganttMonthSpans,
  ganttWindow,
  layoutGantt,
  todayPercent,
} from "@/lib/timeline/layout";
import { TIMELINE_KIND_PLURAL, type TimelineItem } from "@/lib/timeline/types";
import { cn } from "@/lib/ui/cn";
import { KIND_STYLE, PREP_SEGMENT_CLASS } from "./kind-style";

/**
 * The Gantt chart: a horizontal time axis, one row per item, bars for ranges and diamonds for
 * points, grouped by kind.
 *
 * The axis is drawn with percentages of a window that always covers today and every item, inside a
 * sideways scroller with a minimum width. The label column stays pinned, so a long scroll never
 * loses the title of the row you are reading. Month zoom shows months; week zoom shows weeks with
 * the month names above them.
 */

const ZOOMS: ReadonlyArray<{ id: GanttZoom; label: string }> = [
  { id: "week", label: "Weeks" },
  { id: "month", label: "Months" },
];

/** Width of the pinned label column, in pixels. */
const LABEL_WIDTH = 210;
/** The track never gets narrower than this, so a week column stays readable. */
const TRACK_MIN_WIDTH = 760;

const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: `${LABEL_WIDTH}px minmax(0, 1fr)`,
} as const;

function GanttRow({ bar, todayPct }: { bar: GanttBar; todayPct: number | null }) {
  const { item } = bar;
  const style = KIND_STYLE[item.kind];
  const external = item.href !== null && /^https?:\/\//.test(item.href);
  const centre = bar.play.leftPct + bar.play.widthPct / 2;

  const label = (
    <span
      className="sticky left-0 z-20 flex min-h-11 min-w-0 items-center gap-2 border-r border-line bg-surface-raised px-3"
      style={{ width: LABEL_WIDTH }}
    >
      <span aria-hidden="true" className={cn("size-2.5 flex-none rounded-full", style.dot)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{item.title}</span>
        <span className="block truncate text-[11.5px] text-ink-muted">{itemDatesLabel(item)}</span>
      </span>
      {external ? (
        <ExternalLink className="size-3.5 flex-none text-ink-muted" aria-hidden="true" />
      ) : null}
    </span>
  );

  const track = (
    <span className="relative block min-h-11">
      {todayPct === null ? null : (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 z-0 w-px bg-gold"
          style={{ left: `${todayPct}%` }}
        />
      )}
      {bar.prep === null ? null : (
        <span
          aria-hidden="true"
          className={cn("absolute inset-y-2 z-10 rounded-sm", PREP_SEGMENT_CLASS)}
          style={{ left: `${bar.prep.leftPct}%`, width: `${bar.prep.widthPct}%` }}
          title={`Preparation, ${PREP_DAYS} days`}
        />
      )}
      {item.milestone ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 z-20 size-3.5 -translate-y-1/2 rotate-45 rounded-[2px] border",
            style.bar,
          )}
          style={{ left: `calc(${centre}% - 7px)` }}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-2 z-20 min-w-[6px] overflow-hidden rounded-sm border",
            style.bar,
          )}
          style={{ left: `${bar.play.leftPct}%`, width: `${bar.play.widthPct}%` }}
        />
      )}
      {/* A point has no bar to hover, so its name rides beside the diamond. */}
      {item.milestone ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 z-20 -translate-y-1/2 whitespace-nowrap pl-3 text-[11.5px] font-semibold text-ink-muted"
          style={{ left: `${centre}%` }}
        >
          {item.title}
        </span>
      ) : null}
    </span>
  );

  const rowLabel = `${item.title}. ${itemDatesLabel(item)}${
    item.detail === null ? "" : `. ${item.detail}`
  }`;

  if (item.href === null) {
    return (
      <div style={ROW_GRID} className="border-b border-line" aria-label={rowLabel}>
        {label}
        {track}
      </div>
    );
  }

  return (
    <a
      href={item.href}
      aria-label={`${rowLabel}${external ? ". Opens in a new tab." : ""}`}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      style={ROW_GRID}
      className="border-b border-line hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    >
      {label}
      {track}
    </a>
  );
}

export function GanttView({ items, today }: { items: ReadonlyArray<TimelineItem>; today: string }) {
  const [zoom, setZoom] = useState<GanttZoom>("month");

  const window = useMemo(() => ganttWindow(items, today, zoom), [items, today, zoom]);
  const columns = useMemo(() => ganttColumns(window, zoom), [window, zoom]);
  const monthSpans = useMemo(() => ganttMonthSpans(window), [window]);
  const groups = useMemo(() => layoutGantt(items, window), [items, window]);
  const todayPct = todayPercent(today, window);

  if (items.length === 0) {
    return (
      <EmptyState icon={CalendarRange} title="Nothing to plot yet">
        No tournament, pipeline card, task, milestone or release has a date you can show. Clear the
        filters, or add a date to a card or a task.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="overline">Time axis</p>
          <p className="text-sm text-ink">
            {formatWindow(window)}
            {todayPct === null ? null : ` · today is ${formatDay(today)}`}
          </p>
        </div>
        <div role="group" aria-label="Time axis zoom" className="flex flex-wrap gap-1">
          {ZOOMS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={zoom === entry.id}
              onClick={() => setZoom(entry.id)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-[13px] font-semibold",
                zoom === entry.id
                  ? "border-forest bg-forest text-on-forest"
                  : "border-line-strong text-ink hover:bg-surface-sunken",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <p className="hint">
        A diamond is a single day: a task's due date, a milestone's due date or a release's publish
        day. A tournament's lighter segment is its {PREP_DAYS}-day preparation window.
      </p>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface-raised">
        <div style={{ minWidth: LABEL_WIDTH + TRACK_MIN_WIDTH }}>
          <div
            style={ROW_GRID}
            className="sticky top-0 z-30 border-b border-line bg-surface-sunken"
          >
            <span
              className="sticky left-0 z-30 flex min-h-11 items-center border-r border-line bg-surface-sunken px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
              style={{ width: LABEL_WIDTH }}
            >
              Item
            </span>
            <span className="block">
              {zoom === "week" ? (
                <span className="flex border-b border-line">
                  {monthSpans.map((span) => (
                    <span
                      key={span.key}
                      className="truncate border-r border-line px-2 py-1 text-[11px] font-semibold text-ink-muted"
                      style={{ width: `${span.widthPct}%` }}
                    >
                      {span.label}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="flex">
                {columns.map((column) => (
                  <span
                    key={column.key}
                    className="truncate border-r border-line px-2 py-1 text-[11px] font-semibold text-ink-muted last:border-r-0"
                    style={{ width: `${column.widthPct}%` }}
                  >
                    {column.label}
                  </span>
                ))}
              </span>
            </span>
          </div>

          {groups.map((group) => (
            <div key={group.kind}>
              <div style={ROW_GRID} className="border-b border-line bg-surface-sunken/60">
                <span
                  className="sticky left-0 z-20 flex min-h-9 items-center gap-2 border-r border-line bg-surface-sunken px-3"
                  style={{ width: LABEL_WIDTH }}
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-2.5 rounded-full", KIND_STYLE[group.kind].dot)}
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
                    {TIMELINE_KIND_PLURAL[group.kind]}
                  </span>
                  <span className="text-[11px] text-ink-muted">{group.bars.length}</span>
                </span>
                <span className="block" aria-hidden="true" />
              </div>
              {group.bars.map((bar) => (
                <GanttRow key={bar.item.id} bar={bar} todayPct={todayPct} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <p className="hint">
        A bar with no dates of its own runs from the day its card was created to its last update;
        stage change dates are not stored. Scroll sideways for later months.
      </p>

      <span className="sr-only">
        The chart covers {formatDayLong(window.from)} to {formatDayLong(window.to)}.
      </span>
      <span className="sr-only">{groups.length} groups.</span>
    </div>
  );
}
