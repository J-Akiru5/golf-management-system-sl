"use client";

import { CalendarDays, GanttChartSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  filterItems,
  isFilterEmpty,
  type PersonOption,
  personOptions,
  type TimelineFilter,
} from "@/lib/timeline/filters";
import type { GithubFeed } from "@/lib/timeline/github";
import { kindsPresent } from "@/lib/timeline/items";
import type { TimelineItem, TimelineKind } from "@/lib/timeline/types";
import { TIMELINE_KIND_LABEL } from "@/lib/timeline/types";
import { CalendarView } from "./calendar-view";
import { TimelineErrorBoundary } from "./error-boundary";
import { GanttView } from "./gantt-view";
import { TimelineFilters } from "./timeline-filters";

/**
 * The Timeline page's two tabs.
 *
 * The calendar is the PakaonAI calendar's shape on this app's tokens; the Gantt chart is new. Both
 * read the same filtered list, so a filter set on one tab is still set on the other. The page is
 * read-only: it shows where things are, and every row links to the place that owns it.
 */

export type TimelineTab = "calendar" | "gantt";

export function TimelineView({
  items,
  members,
  today,
  github,
  tournamentsFailed,
  demo,
  initialTab,
}: {
  items: TimelineItem[];
  members: ReadonlyArray<{ id: string; name: string }>;
  today: string;
  github: GithubFeed;
  tournamentsFailed: boolean;
  demo: boolean;
  initialTab: TimelineTab;
}) {
  const [tab, setTab] = useState<TimelineTab>(initialTab);
  const [filter, setFilter] = useState<TimelineFilter>({ kinds: [], person: null });

  const names = useMemo(
    () => new Map(members.map((member) => [member.id, member.name])),
    [members],
  );
  const people: PersonOption[] = useMemo(() => personOptions(items, names), [items, names]);

  const counts = useMemo(() => {
    const found = new Map<TimelineKind, number>();
    for (const item of items) found.set(item.kind, (found.get(item.kind) ?? 0) + 1);
    return found;
  }, [items]);

  const kinds = useMemo(() => kindsPresent(items), [items]);
  const visible = useMemo(() => filterItems(items, filter), [items, filter]);

  const calendarKey = `${filter.kinds.join(",")}:${filter.person ?? "all"}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="overline">Timeline</p>
          <h1 className="mt-1 text-2xl">Events, pipeline and the work around them</h1>
          <p className="hint mt-1">
            Tournaments, pipeline cards, tasks, milestones and releases on one calendar and one
            chart. Each row opens the place that owns it.
          </p>
        </div>
      </div>

      {demo ? (
        <p
          role="status"
          className="rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm text-ink"
        >
          Demo data. Nothing on this page is real; it is here so the calendar and the chart can be
          checked without a database.
        </p>
      ) : null}

      {tournamentsFailed ? (
        <p className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          The tournament list could not be read just now. Cards, tasks and GitHub items are shown as
          usual.
        </p>
      ) : null}

      {github.status === "unconfigured" ? <p className="hint">{github.message}</p> : null}

      {github.status === "error" ? <p className="hint">{github.message}</p> : null}

      <TimelineFilters
        kinds={kinds}
        counts={counts}
        total={visible.length}
        people={people}
        filter={filter}
        onChange={setFilter}
      />

      {!isFilterEmpty(filter) && visible.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface-raised px-4 py-6 text-center text-sm text-ink-muted">
          Nothing matches these filters. Clear them to see everything again.
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as TimelineTab)}>
        <TabsList className="flex w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="calendar" className="gap-2">
            <CalendarDays className="size-4" aria-hidden="true" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="gantt" className="gap-2">
            <GanttChartSquare className="size-4" aria-hidden="true" />
            Gantt
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <TimelineErrorBoundary
            title="The calendar could not be drawn"
            message="Reload the view, or open the Gantt tab in the meantime."
            retryLabel="Try again"
            resetKey={calendarKey}
          >
            <CalendarView items={visible} today={today} />
          </TimelineErrorBoundary>
        </TabsContent>

        <TabsContent value="gantt">
          <TimelineErrorBoundary
            title="The chart could not be drawn"
            message="Reload the view, or open the calendar tab in the meantime."
            retryLabel="Try again"
            resetKey={calendarKey}
          >
            <GanttView items={visible} today={today} />
          </TimelineErrorBoundary>
        </TabsContent>
      </Tabs>

      <section
        aria-labelledby="timeline-notes"
        className="rounded-lg border border-line bg-surface-raised p-4"
      >
        <h2 id="timeline-notes" className="font-display text-base font-bold text-ink">
          What a bar means
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>
            A tournament bar is its playing days. The lighter, dashed segment before it is the{" "}
            preparation window, which is not part of the event.
          </li>
          <li>
            A pipeline card bar runs from its start date to its end date. A card with no dates runs
            from the day it was created to its last update; stage change dates are not stored, so a
            stage cannot be shown as a span.
          </li>
          <li>A task appears on its due date. A task with no due date has no place here.</li>
          <li>
            A milestone is drawn from its due date and a release from its publish day, both read
            from GitHub. Without a GitHub token the page says so and shows the rest.
          </li>
          <li>
            {TIMELINE_KIND_LABEL.tournament}s come from the public event list, so an event that has
            not been announced is not shown.
          </li>
        </ul>
      </section>
    </div>
  );
}
