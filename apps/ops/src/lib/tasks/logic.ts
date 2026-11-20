/**
 * Task logic that needs no browser and no database.
 *
 * Everything here takes `today` as a value. The clock is read once, in the page that renders the
 * list, so a test and a screenshot can both say which day they mean.
 */
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/db/constants";
import type { TaskPriority, TaskStatus, WsTaskRow } from "@/lib/db/types";

export type TaskView = "mine" | "all" | "assignee" | "overdue";

export const TASK_VIEWS: ReadonlyArray<{ id: TaskView; label: string }> = [
  { id: "mine", label: "My tasks" },
  { id: "all", label: "All" },
  { id: "assignee", label: "By assignee" },
  { id: "overdue", label: "Overdue" },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Milliseconds at midnight UTC for a date-only value. Throws rather than guess at a bad string. */
function utcMidnight(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Not a date: ${iso}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error(`Not a date: ${iso}`);
  }
  return time;
}

const DAY_MS = 86_400_000;

/** The local calendar date as `YYYY-MM-DD`. The one place the clock is read. */
export function isoToday(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Moves a date-only value by whole days, across month and year boundaries. */
export function addDays(iso: string, days: number): string {
  const time = utcMidnight(iso) + days * DAY_MS;
  return new Date(time).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Positive means `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

/** A task is overdue when it is not done and its due date is before today. */
export function isOverdue(task: Pick<WsTaskRow, "status" | "due_date">, today: string): boolean {
  if (task.status === "done") return false;
  if (task.due_date === null) return false;
  return daysBetween(today, task.due_date) < 0;
}

/** "Overdue by 3 days", "Due today", "Due tomorrow", "Due 25 Nov", "No due date". */
export function dueLabel(task: Pick<WsTaskRow, "status" | "due_date">, today: string): string {
  if (task.due_date === null) return "No due date";

  const days = daysBetween(today, task.due_date);

  // A done task is never called overdue: it is shown with its date, quietly.
  if (days < 0 && task.status !== "done") {
    const late = -days;
    return `Overdue by ${late} ${late === 1 ? "day" : "days"}`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";

  const match = ISO_DATE.exec(task.due_date);
  if (!match) throw new Error(`Not a date: ${task.due_date}`);
  const day = Number(match[3]);
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) throw new Error(`Not a date: ${task.due_date}`);

  // The year only appears when it differs from today's, so the common case stays short.
  const todayYear = ISO_DATE.exec(today)?.[1];
  const dueYear = match[1];
  const year = dueYear === todayYear ? "" : ` ${dueYear}`;
  return `Due ${day} ${month}${year}`;
}

const STATUS_ORDER = new Map(TASK_STATUSES.map((entry, index) => [entry.id, index]));
const PRIORITY_ORDER = new Map(TASK_PRIORITIES.map((entry, index) => [entry.id, index]));

/**
 * The list order: status (to do first), then due date (none last), then priority (urgent first),
 * then the stored position, then id so the order is stable.
 */
export function sortTasks(tasks: ReadonlyArray<WsTaskRow>): WsTaskRow[] {
  return [...tasks].sort((a, b) => {
    const status = (STATUS_ORDER.get(a.status) ?? 0) - (STATUS_ORDER.get(b.status) ?? 0);
    if (status !== 0) return status;

    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }

    const priority = (PRIORITY_ORDER.get(b.priority) ?? 0) - (PRIORITY_ORDER.get(a.priority) ?? 0);
    if (priority !== 0) return priority;

    if (a.position !== b.position) return a.position - b.position;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * The rows a tab shows.
 *
 * The overdue view needs the day, so it is passed in. Without it the call is an error rather than
 * a guess: an overdue list computed against the machine clock would disagree with the labels.
 */
export function filterTasks(
  tasks: ReadonlyArray<WsTaskRow>,
  view: TaskView,
  viewerId: string,
  assigneeId?: string,
  today?: string,
): WsTaskRow[] {
  switch (view) {
    case "mine":
      return tasks.filter((task) => task.assignee_id === viewerId);
    case "all":
      return [...tasks];
    case "assignee":
      if (!assigneeId) return [];
      return tasks.filter((task) => task.assignee_id === assigneeId);
    case "overdue":
      if (!today) throw new Error("The overdue view needs the current day.");
      return tasks.filter((task) => isOverdue(task, today));
    default:
      throw new Error(`Unknown task view: ${String(view)}`);
  }
}

/** One change to a task, as the live feed reports it. */
export type TaskChange = { type: "upsert"; task: WsTaskRow } | { type: "remove"; taskId: string };

/**
 * Applies a live change to the list. A change is dropped when the local write for that task is
 * still in flight, and an older `updated_at` never replaces a newer row, so a local edit is not
 * undone by an event that left the server before it landed.
 *
 * Returns the same array when nothing changed, so React can skip the render.
 */
export function mergeTaskChange(
  tasks: WsTaskRow[],
  change: TaskChange,
  pending: ReadonlySet<string>,
): WsTaskRow[] {
  if (change.type === "remove") {
    if (pending.has(change.taskId)) return tasks;
    const next = tasks.filter((task) => task.id !== change.taskId);
    return next.length === tasks.length ? tasks : next;
  }

  const incoming = change.task;
  if (pending.has(incoming.id)) return tasks;

  const index = tasks.findIndex((task) => task.id === incoming.id);
  if (index === -1) return [...tasks, incoming];

  const existing = tasks[index];
  if (!existing) return [...tasks, incoming];
  if (Date.parse(incoming.updated_at) <= Date.parse(existing.updated_at)) {
    return tasks;
  }

  const next = [...tasks];
  next[index] = incoming;
  return next;
}

/** A change the live channel reported, normalised to the table it came from. */
export type ParsedChange =
  | { table: "ws_tasks"; change: TaskChange }
  | { table: "ws_task_comments"; taskId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.some((entry) => entry.id === value);
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return TASK_PRIORITIES.some((entry) => entry.id === value);
}

function isTaskRow(value: unknown): value is WsTaskRow {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.updated_at === "string" &&
    typeof value.position === "number" &&
    isTaskStatus(value.status) &&
    isTaskPriority(value.priority) &&
    (value.due_date === null || typeof value.due_date === "string") &&
    (value.assignee_id === null || typeof value.assignee_id === "string")
  );
}

function readId(value: unknown): string | null {
  return isRecord(value) && typeof value.id === "string" ? value.id : null;
}

function readTaskId(value: unknown): string | null {
  return isRecord(value) && typeof value.task_id === "string" ? value.task_id : null;
}

/**
 * Reads one broadcast message from `ws:tasks`.
 *
 * `realtime.broadcast_changes` sends the row and the table name in the payload. The client
 * subscription wraps that again, so a message with its own `payload` object is unwrapped once.
 * Anything unrecognised returns null: a hint that cannot be read is ignored, never guessed at.
 */
export function parseRealtimeChange(message: unknown): ParsedChange | null {
  if (!isRecord(message)) return null;

  const body = isRecord(message.payload) && !("table" in message) ? message.payload : message;
  const table = body.table;
  const eventType = body.type;

  if (typeof eventType !== "string") return null;
  const operation = eventType.toUpperCase();

  if (table === "ws_tasks") {
    if (operation === "DELETE") {
      const taskId = readId(body.old_record) ?? readId(body.record);
      return taskId === null ? null : { table: "ws_tasks", change: { type: "remove", taskId } };
    }
    if (operation === "INSERT" || operation === "UPDATE") {
      return isTaskRow(body.record)
        ? { table: "ws_tasks", change: { type: "upsert", task: body.record } }
        : null;
    }
    return null;
  }

  if (table === "ws_task_comments") {
    const taskId = readTaskId(body.record) ?? readTaskId(body.old_record);
    return taskId === null ? null : { table: "ws_task_comments", taskId };
  }

  return null;
}
