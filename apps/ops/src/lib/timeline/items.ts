import { PIPELINE_STAGES, TASK_STATUSES } from "@/lib/db/constants";
import type { PipelineStage, TaskStatus } from "@/lib/db/types";
import { addDays, dayFromTimestamp, daysBetween, formatDayRange, isDay, parseDay } from "./dates";
import type {
  CardSource,
  MilestoneSource,
  ReleaseSource,
  TaskSource,
  TimelineBasis,
  TimelineItem,
  TimelineKind,
  TournamentSource,
} from "./types";
import { TIMELINE_KINDS } from "./types";

/**
 * One item per row of the four sources, and nothing invented.
 *
 * A row that cannot be placed on a day is dropped rather than given today's date. The mapping is
 * pure, so the tests pin the awkward cases: a tournament with one day, a card with no dates, a task
 * with no due date, a milestone with no due date.
 */

/**
 * How many days before the first playing day count as preparation. Two weeks is the working value
 * the board's prep stage usually opens at; it lives here so it is one number to change.
 */
export const PREP_DAYS = 14;

const STAGE_LABEL = new Map(PIPELINE_STAGES.map((entry) => [entry.id, entry.label]));
const STATUS_LABEL = new Map(TASK_STATUSES.map((entry) => [entry.id, entry.label]));

function stageLabel(stage: PipelineStage): string {
  return STAGE_LABEL.get(stage) ?? stage;
}

function statusLabel(status: TaskStatus): string {
  return STATUS_LABEL.get(status) ?? status;
}

/** A tournament's playing days, ascending and de-duplicated. Invalid values are dropped. */
export function playingDays(dates: ReadonlyArray<unknown>): string[] {
  const seen = new Set<string>();
  for (const value of dates) {
    if (isDay(value)) seen.add(value);
  }
  return [...seen].sort();
}

export function tournamentItems(
  tournaments: ReadonlyArray<TournamentSource>,
  options: { publicBase: string; today: string },
): TimelineItem[] {
  const base = options.publicBase.replace(/\/+$/, "");
  const items: TimelineItem[] = [];

  for (const tournament of tournaments) {
    const days = playingDays(tournament.dates);
    const start = days[0];
    const end = days.at(-1);
    if (start === undefined || end === undefined) continue;

    const live = options.today >= start && options.today <= end;
    const detail = tournament.finished ? "Past event" : live ? "Playing now" : "Upcoming";

    items.push({
      id: `tournament:${tournament.id}`,
      kind: "tournament",
      title: tournament.name,
      detail,
      start,
      end,
      prepStart: addDays(start, -PREP_DAYS),
      milestone: false,
      href: `${base}/events/${tournament.id}`,
      people: [],
      basis: "dates",
    });
  }

  return items;
}

function isStage(value: unknown): value is PipelineStage {
  return typeof value === "string" && STAGE_LABEL.has(value as PipelineStage);
}

/**
 * A card's bar: its own start and end dates when it has them, otherwise the day it was created to
 * the day it was last updated. `ws_pipeline_cards` stores no stage history, so a card that sat in
 * one stage for a month cannot show that month; the basis on the item says which pair was used.
 */
export function cardItems(cards: ReadonlyArray<CardSource>): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const card of cards) {
    const ownStart = isDay(card.start_date) ? card.start_date : null;
    const ownEnd = isDay(card.end_date) ? card.end_date : null;
    const created = dayFromTimestamp(card.created_at);
    const updated = dayFromTimestamp(card.updated_at);

    const start = ownStart ?? created ?? ownEnd;
    if (start === null) continue;

    const end = [ownEnd, updated, start].find((day): day is string => day !== null && day >= start);
    const finalEnd = end ?? start;

    const stage = isStage(card.stage) ? stageLabel(card.stage) : String(card.stage);

    items.push({
      id: `card:${card.id}`,
      kind: "card",
      title: card.title,
      detail: `${stage} · ${card.club_name}`,
      start,
      end: finalEnd,
      prepStart: null,
      milestone: false,
      href: `/board?card=${encodeURIComponent(card.id)}`,
      people: card.owner_id === null ? [] : [card.owner_id],
      basis: ownStart === null && ownEnd === null ? "created-and-updated" : "dates",
    });
  }

  return items;
}

/** Tasks with a due date. A task without one has no place on a timeline, so it is not shown. */
export function taskItems(tasks: ReadonlyArray<TaskSource>): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const task of tasks) {
    if (!isDay(task.due_date)) continue;

    items.push({
      id: `task:${task.id}`,
      kind: "task",
      title: task.title,
      detail: `Due · ${statusLabel(task.status)}`,
      start: task.due_date,
      end: task.due_date,
      prepStart: null,
      milestone: true,
      href: `/tasks?task=${encodeURIComponent(task.id)}`,
      people: task.assignee_id === null ? [] : [task.assignee_id],
      basis: "due-date",
    });
  }

  return items;
}

export function milestoneItems(milestones: ReadonlyArray<MilestoneSource>): TimelineItem[] {
  return milestones.map((milestone) => ({
    id: `milestone:${milestone.number}`,
    kind: "milestone" as const,
    title: milestone.title,
    detail: milestone.state === "closed" ? "Closed milestone" : "Open milestone",
    start: milestone.dueOn,
    end: milestone.dueOn,
    prepStart: null,
    milestone: true,
    href: milestone.url,
    people: [],
    basis: "due-on" as const,
  }));
}

export function releaseItems(releases: ReadonlyArray<ReleaseSource>): TimelineItem[] {
  return releases.map((release) => ({
    id: `release:${release.tag}`,
    kind: "release" as const,
    title: release.name.trim() === "" ? release.tag : release.name,
    detail: release.prerelease ? `Pre-release · ${release.tag}` : `Release · ${release.tag}`,
    start: release.publishedOn,
    end: release.publishedOn,
    prepStart: null,
    milestone: true,
    href: release.url,
    people: [],
    basis: "published" as const,
  }));
}

const KIND_ORDER = new Map(TIMELINE_KINDS.map((kind, index) => [kind, index]));

/** Start day, then kind, then title, then id. Stable, so two renders never swap rows. */
export function compareItems(a: TimelineItem, b: TimelineItem): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  const kindA = KIND_ORDER.get(a.kind) ?? 0;
  const kindB = KIND_ORDER.get(b.kind) ?? 0;
  if (kindA !== kindB) return kindA - kindB;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type TimelineSources = {
  tournaments: TimelineItem[];
  cards: TimelineItem[];
  tasks: TimelineItem[];
  milestones: TimelineItem[];
  releases: TimelineItem[];
};

/** Every source in one list, in a stable order. */
export function buildTimeline(sources: TimelineSources): TimelineItem[] {
  return [
    ...sources.tournaments,
    ...sources.cards,
    ...sources.tasks,
    ...sources.milestones,
    ...sources.releases,
  ].sort(compareItems);
}

/** True when the item covers the day. A milestone covers exactly its own day. */
export function itemCoversDay(item: TimelineItem, day: string): boolean {
  return item.start <= day && day <= item.end;
}

/** Every item on one day, in calendar order. */
export function itemsOnDay(items: ReadonlyArray<TimelineItem>, day: string): TimelineItem[] {
  return items
    .filter((item) => itemCoversDay(item, day))
    .slice()
    .sort(compareItems);
}

export type AgendaGroup = { day: string; items: TimelineItem[] };

/**
 * The agenda list for a range: each item once, under the day it starts, and an item that begins
 * before the range is shown under the range's first day rather than being hidden. Days are
 * ascending and a day with nothing on it is left out.
 */
export function agendaGroups(
  items: ReadonlyArray<TimelineItem>,
  from: string,
  to: string,
): AgendaGroup[] {
  if (parseDay(from) === null || parseDay(to) === null) return [];
  if (daysBetween(from, to) < 0) return [];

  const groups = new Map<string, TimelineItem[]>();
  for (const item of items) {
    if (item.end < from || item.start > to) continue;
    const day = item.start < from ? from : item.start;
    const list = groups.get(day);
    if (list === undefined) groups.set(day, [item]);
    else list.push(item);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([day, list]) => ({ day, items: list.slice().sort(compareItems) }));
}

/** The words for a bar's dates, when the choice needs saying. Null when it speaks for itself. */
const BASIS_NOTE: Record<TimelineBasis, string | null> = {
  dates: null,
  "created-and-updated":
    "No start or end date is set, so the bar runs from the day the card was created to its last update. Stage change dates are not stored.",
  "due-date": null,
  "due-on": null,
  published: null,
};

export function basisNote(basis: TimelineBasis | null): string | null {
  return basis === null ? null : BASIS_NOTE[basis];
}

/** A short line for an item's dates, used by the agenda and the day panel. */
export function itemDatesLabel(item: TimelineItem): string {
  return formatDayRange(item.start, item.end);
}

/** The kinds present in a list, in the fixed order. Used for the filter chips. */
export function kindsPresent(items: ReadonlyArray<TimelineItem>): TimelineKind[] {
  const present = new Set(items.map((item) => item.kind));
  return TIMELINE_KINDS.filter((kind) => present.has(kind));
}
