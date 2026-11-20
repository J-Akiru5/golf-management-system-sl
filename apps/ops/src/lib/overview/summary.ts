/**
 * Pure summaries for the overview page.
 *
 * Every function takes the day it should use as a value, so a test, a screenshot and the rendered
 * page all agree. Nothing here reads the clock, the database or the browser.
 */
import { parseIsoDate } from "@/lib/board/format";
import { PIPELINE_STAGES, TASK_PRIORITIES } from "@/lib/db/constants";
import type {
  PipelineStage,
  TaskPriority,
  TaskStatus,
  WsPipelineCardRow,
  WsTaskRow,
} from "@/lib/db/types";
import type { DocSummary } from "@/lib/docs/repo";
import { isOverdue } from "@/lib/tasks/logic";

/** The closed stage. Everything before it in `PIPELINE_STAGES` counts as open work. */
export const CLOSED_STAGE: PipelineStage = "invoiced_closed";

/** How many rows the "next due" list shows. */
export const NEXT_DUE_LIMIT = 5;

/** One row of the "next due" list. Enough for the link and its label, nothing more. */
export type NextDueTask = {
  id: string;
  title: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
};

export type TaskSummary = {
  /** The viewer's tasks that are not done. */
  open: number;
  /** The viewer's open tasks whose due date is before today. */
  overdue: number;
  /** Every task with no assignee, whatever its status. */
  unassigned: number;
  /** The viewer's open tasks with a due date, earliest first, ties by priority. */
  nextDue: NextDueTask[];
};

/** One currency's share of a stage. Amounts in different currencies are never added together. */
export type MoneyTotal = { currency: string; amount: number };

export type PipelineStageSummary = {
  stage: PipelineStage;
  label: string;
  count: number;
  /** Empty when no card in the stage has a quoted amount. */
  totals: MoneyTotal[];
};

export type PipelineSummary = {
  stages: PipelineStageSummary[];
  /** Cards in every stage before the closed one. */
  openCount: number;
  openTotals: MoneyTotal[];
};

const PRIORITY_RANK = new Map(TASK_PRIORITIES.map((entry, index) => [entry.id, index]));

const STAGE_ORDER = new Map(PIPELINE_STAGES.map((entry, index) => [entry.id, index]));

function requireDay(today: string, message: string): void {
  if (parseIsoDate(today) === null) throw new Error(`${message}: ${today}`);
}

function compareDue(a: NextDueTask, b: NextDueTask): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;

  const rankA = PRIORITY_RANK.get(a.priority) ?? 0;
  const rankB = PRIORITY_RANK.get(b.priority) ?? 0;
  if (rankA !== rankB) return rankB - rankA;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The counts and the next due rows for the viewer.
 *
 * `today` is required: an overdue count worked out against the machine clock would disagree with
 * the labels on the task list. A missing viewer id is an error, not "everyone".
 */
export function taskSummary(
  tasks: ReadonlyArray<WsTaskRow>,
  viewerId: string,
  today: string,
): TaskSummary {
  if (viewerId.trim() === "") throw new Error("The task summary needs the viewer's id.");
  requireDay(today, "The task summary needs a real day");

  let open = 0;
  let overdue = 0;
  let unassigned = 0;
  const nextDue: NextDueTask[] = [];

  for (const task of tasks) {
    if (task.assignee_id === null) unassigned += 1;
    if (task.assignee_id !== viewerId || task.status === "done") continue;

    open += 1;
    if (isOverdue(task, today)) overdue += 1;
    if (task.due_date === null) continue;

    nextDue.push({
      id: task.id,
      title: task.title,
      dueDate: task.due_date,
      priority: task.priority,
      status: task.status,
    });
  }

  nextDue.sort(compareDue);

  return { open, overdue, unassigned, nextDue: nextDue.slice(0, NEXT_DUE_LIMIT) };
}

function addAmount(totals: Map<string, number>, currency: string, amount: number): void {
  totals.set(currency, (totals.get(currency) ?? 0) + amount);
}

/** Descending amount, then currency code, so the row reads the same on every render. */
function toTotals(totals: ReadonlyMap<string, number>): MoneyTotal[] {
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => {
      if (a.amount !== b.amount) return b.amount - a.amount;
      return a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0;
    });
}

/**
 * Per stage: how many cards and, where a quoted amount exists, its total. The open figures cover
 * every stage before `invoiced_closed`.
 */
export function pipelineSummary(cards: ReadonlyArray<WsPipelineCardRow>): PipelineSummary {
  const counts = new Map<PipelineStage, number>();
  const money = new Map<PipelineStage, Map<string, number>>();
  for (const entry of PIPELINE_STAGES) counts.set(entry.id, 0);

  for (const card of cards) {
    if (!STAGE_ORDER.has(card.stage)) throw new Error(`Unknown pipeline stage: ${card.stage}`);

    counts.set(card.stage, (counts.get(card.stage) ?? 0) + 1);

    if (card.quoted_amount === null) continue;
    if (!Number.isFinite(card.quoted_amount)) {
      throw new Error(`The quoted amount on ${card.id} is not a number.`);
    }

    let stageTotals = money.get(card.stage);
    if (stageTotals === undefined) {
      stageTotals = new Map();
      money.set(card.stage, stageTotals);
    }
    addAmount(stageTotals, card.currency, card.quoted_amount);
  }

  const closedIndex = STAGE_ORDER.get(CLOSED_STAGE) ?? PIPELINE_STAGES.length;
  const openTotals = new Map<string, number>();
  let openCount = 0;

  const stages = PIPELINE_STAGES.map((entry, index) => {
    const count = counts.get(entry.id) ?? 0;
    if (index < closedIndex) {
      openCount += count;
      for (const [currency, amount] of money.get(entry.id) ?? []) {
        addAmount(openTotals, currency, amount);
      }
    }

    return {
      stage: entry.id,
      label: entry.label,
      count,
      totals: toTotals(money.get(entry.id) ?? new Map()),
    };
  });

  return { stages, openCount, openTotals: toTotals(openTotals) };
}

/**
 * The most recently edited documents, archived ones left out. The list is copied and sorted, so
 * the caller's order is never changed.
 */
export function recentDocs(docs: ReadonlyArray<DocSummary>, limit: number): DocSummary[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`The document limit must be a whole number of zero or more: ${limit}`);
  }
  if (limit === 0) return [];

  return docs
    .filter((doc) => !doc.archived)
    .slice()
    .sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      if (a.title !== b.title) return a.title < b.title ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, limit);
}

const TODAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The day in words: "Friday, 20 November 2026". Built from UTC parts, so every machine agrees. */
export function formatToday(today: string): string {
  const date = parseIsoDate(today);
  if (date === null) throw new Error(`Not a date: ${today}`);
  return TODAY_FORMAT.format(date);
}
