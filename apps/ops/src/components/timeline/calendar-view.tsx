"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addDays,
  addMonths,
  endOfMonth,
  formatDay,
  formatDayLong,
  formatDayRange,
  formatMonthYear,
  isSameMonth,
  monthGrid,
  startOfMonth,
  WEEKDAYS_SHORT,
  weekDays,
  weekdayIndex,
} from "@/lib/timeline/dates";
import { agendaGroups, itemsOnDay } from "@/lib/timeline/items";
import type { TimelineItem } from "@/lib/timeline/types";
import { cn } from "@/lib/ui/cn";
import { TimelineItemLink } from "./item-link";
import { KIND_STYLE } from "./kind-style";

/**
 * The calendar: month, week and agenda, in the PakaonAI calendar's shape (a fixed toolbar, a grid,
 * and a day pane for the busy days) but drawn on this app's own tokens and without a calendar
 * package, which `apps/ops` does not have.
 *
 * The month cells are buttons that open the day's list. That keeps every target at 44px or more on
 * a phone; a chip small enough to fit inside a month cell would not be. A day with nothing on it
 * says so in the pane rather than showing an empty chip.
 */

export type CalendarZoom = "month" | "week" | "agenda";

const ZOOMS: ReadonlyArray<{ id: CalendarZoom; label: string }> = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "agenda", label: "Agenda" },
];

const MAX_CHIPS = 2;

function stepDay(zoom: CalendarZoom, anchor: string, direction: 1 | -1): string {
  return zoom === "week" ? addDays(anchor, 7 * direction) : addMonths(anchor, direction);
}

function rangeTitle(zoom: CalendarZoom, anchor: string): string {
  if (zoom === "week") {
    const days = weekDays(anchor);
    const first = days[0];
    const last = days.at(-1);
    if (first === undefined || last === undefined) return formatDay(anchor);
    return formatDayRange(first, last);
  }
  return formatMonthYear(anchor);
}

export function CalendarView({
  items,
  today,
}: {
  items: ReadonlyArray<TimelineItem>;
  today: string;
}) {
  const [zoom, setZoom] = useState<CalendarZoom>("month");
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<string | null>(null);

  const monthDays = useMemo(() => monthGrid(anchor), [anchor]);
  const week = useMemo(() => weekDays(anchor), [anchor]);

  const agenda = useMemo(
    () => agendaGroups(items, startOfMonth(anchor), endOfMonth(anchor)),
    [items, anchor],
  );

  const selectedItems = selected === null ? [] : itemsOnDay(items, selected);

  if (items.length === 0) {
    return (
      <EmptyState icon={CalendarDays} title="Nothing on the calendar yet">
        No tournament, pipeline card, task, milestone or release falls on a day you can show. Add a
        date to a card or a task, or clear the filters.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor(stepDay(zoom, anchor, -1))}
            aria-label={zoom === "week" ? "Previous week" : "Previous month"}
            className="grid size-11 place-items-center rounded-md border border-line-strong text-ink hover:bg-surface-sunken"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAnchor(today);
              setSelected(null);
            }}
            className="min-h-11 rounded-md border border-line-strong px-3 text-sm font-semibold text-ink hover:bg-surface-sunken"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setAnchor(stepDay(zoom, anchor, 1))}
            aria-label={zoom === "week" ? "Next week" : "Next month"}
            className="grid size-11 place-items-center rounded-md border border-line-strong text-ink hover:bg-surface-sunken"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
          <p aria-live="polite" className="ml-1 font-display text-base font-bold text-ink">
            {rangeTitle(zoom, anchor)}
          </p>
        </div>

        <div role="group" aria-label="Calendar view" className="flex flex-wrap gap-1">
          {ZOOMS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={zoom === entry.id}
              onClick={() => {
                setZoom(entry.id);
                setSelected(null);
              }}
              className={cn(
                "min-h-11 rounded-md border px-3 text-[13px] font-semibold",
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

      {zoom === "month" ? (
        <div className="overflow-hidden rounded-lg border border-line bg-surface-raised">
          <div className="grid grid-cols-7 border-b border-line bg-surface-sunken">
            {WEEKDAYS_SHORT.map((day) => (
              <p
                key={day}
                className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
              >
                {day}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const dayItems = itemsOnDay(items, day);
              const outside = !isSameMonth(day, anchor);
              const isToday = day === today;
              const isSelected = selected === day;
              const shown = dayItems.slice(0, MAX_CHIPS);
              const more = dayItems.length - shown.length;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : day)}
                  aria-pressed={isSelected}
                  aria-label={`${formatDayLong(day)}, ${
                    dayItems.length === 0
                      ? "nothing on"
                      : `${dayItems.length} item${dayItems.length === 1 ? "" : "s"}`
                  }`}
                  className={cn(
                    "flex min-h-24 flex-col gap-1 border-b border-r border-line p-1.5 text-left align-top last:border-r-0 focus-visible:relative focus-visible:z-10",
                    outside ? "bg-surface-sunken/50 text-ink-muted" : "bg-surface-raised",
                    isSelected
                      ? "outline outline-2 -outline-offset-2 outline-forest"
                      : "hover:bg-surface-sunken",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
                      isToday
                        ? "bg-forest text-on-forest"
                        : outside
                          ? "text-ink-muted"
                          : "text-ink",
                    )}
                  >
                    {Number(day.slice(8, 10))}
                  </span>
                  {shown.map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        "block truncate rounded-sm border px-1.5 py-0.5 text-[11.5px] font-semibold",
                        KIND_STYLE[item.kind].chip,
                      )}
                    >
                      {item.title}
                    </span>
                  ))}
                  {more > 0 ? (
                    <span className="px-1 text-[11px] font-semibold text-ink-muted">
                      +{more} more
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {zoom === "week" ? (
        <div className="grid gap-2 sm:grid-cols-7">
          {week.map((day) => {
            const dayItems = itemsOnDay(items, day);
            const isToday = day === today;
            return (
              <section
                key={day}
                aria-label={formatDayLong(day)}
                className={cn(
                  "flex min-h-40 flex-col gap-1 rounded-lg border bg-surface-raised p-2",
                  isToday ? "border-forest" : "border-line",
                )}
              >
                <header className="flex items-baseline justify-between gap-1 border-b border-line pb-1">
                  <h3 className="text-[13px] font-semibold text-ink">
                    {WEEKDAYS_SHORT[weekdayIndex(day)]} {Number(day.slice(8, 10))}
                  </h3>
                  {isToday ? <span className="overline text-forest">Today</span> : null}
                </header>
                {dayItems.length === 0 ? (
                  <p className="px-1 py-2 text-[13px] text-ink-muted">Nothing</p>
                ) : (
                  dayItems.map((item) => (
                    <TimelineItemLink key={item.id} item={item} showDates={false} />
                  ))
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {zoom === "agenda" ? (
        <div className="rounded-lg border border-line bg-surface-raised">
          {agenda.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              Nothing in {formatMonthYear(anchor)}.
            </p>
          ) : (
            <ol className="divide-y divide-line">
              {agenda.map((group) => (
                <li key={group.day} className="px-3 py-2">
                  <h3 className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                    {formatDayLong(group.day)}
                  </h3>
                  {group.items.map((item) => (
                    <TimelineItemLink key={item.id} item={item} />
                  ))}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {selected !== null ? (
        <section
          aria-label={`Items on ${formatDayLong(selected)}`}
          className="rounded-lg border border-line bg-surface-raised"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
            <h2 className="font-display text-base font-bold text-ink">{formatDayLong(selected)}</h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close the day"
              className="grid size-11 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="p-2">
            {selectedItems.length === 0 ? (
              <p className="px-2 py-3 text-sm text-ink-muted">Nothing on this day.</p>
            ) : (
              selectedItems.map((item) => <TimelineItemLink key={item.id} item={item} />)
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
