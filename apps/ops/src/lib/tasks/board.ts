import { applyMove, sortColumn } from "@/lib/board/order";
import { TASK_STATUSES } from "@/lib/db/constants";
import type { TaskStatus, WsTaskRow } from "@/lib/db/types";
import { filterTasks, type TaskView } from "./logic";

/**
 * The task board's pure logic: its columns, the grouping behind them, the filter that fills them
 * and the move a drop turns into.
 *
 * Ordering is not reimplemented here. A task is a card with a `position`, so the pipeline board's
 * rules already apply: a move writes the midpoint of its neighbours and renumbers the column when
 * the gap gets too small. `lib/board/order` is imported, never copied.
 *
 * Nothing here touches the network or the database, and `today` is passed in, never read.
 */

export type TaskBoardColumn = { id: TaskStatus; label: string };

/** The four columns, left to right, from the statuses in the database. */
export const TASK_BOARD_COLUMNS: ReadonlyArray<TaskBoardColumn> = TASK_STATUSES.map((entry) => ({
  id: entry.id,
  label: entry.label,
}));

/** True only for a status the database allows. */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.some((entry) => entry.id === value);
}

/** A task on the board: the row plus the column the kanban needs. */
export type TaskBoardItem = WsTaskRow & { columnId: TaskStatus };

export function toBoardItems(tasks: ReadonlyArray<WsTaskRow>): TaskBoardItem[] {
  return tasks.map((task) => ({ ...task, columnId: task.status }));
}

/** Every status is a key, so an empty column is empty rather than missing. */
export type TaskColumnGroups = ReadonlyMap<TaskStatus, WsTaskRow[]>;

/**
 * Group the rows into the four columns. Each column is ordered by `position`, then by id, which is
 * the order the kanban draws.
 */
export function groupTasksByStatus(tasks: ReadonlyArray<WsTaskRow>): TaskColumnGroups {
  const groups = new Map<TaskStatus, WsTaskRow[]>();
  for (const column of TASK_STATUSES) groups.set(column.id, []);
  for (const task of tasks) groups.get(task.status)?.push(task);
  for (const [status, list] of groups) groups.set(status, byPosition(list));
  return groups;
}

/**
 * The board's ordering asks for a `stage`; a task's stage is its status. Mapping in and out here is
 * what lets the board reuse the pipeline's ordering instead of holding a second copy of it.
 */
type PositionedTask = WsTaskRow & { stage: TaskStatus };

function asCards(tasks: ReadonlyArray<WsTaskRow>): PositionedTask[] {
  return tasks.map((task) => ({ ...task, stage: task.status }));
}

function asTasks(cards: ReadonlyArray<PositionedTask>): WsTaskRow[] {
  return cards.map(({ stage, ...task }) => ({ ...task, status: stage }));
}

function byPosition(tasks: ReadonlyArray<WsTaskRow>): WsTaskRow[] {
  return asTasks(sortColumn(asCards(tasks)));
}

/** The rows the board shows for one filter. The same filter the list tabs use. */
export function filterBoardTasks(
  tasks: ReadonlyArray<WsTaskRow>,
  view: TaskView,
  viewerId: string,
  assigneeId?: string,
  today?: string,
): WsTaskRow[] {
  return filterTasks(tasks, view, viewerId, assigneeId, today);
}

export type TaskMoveInput = {
  id: string;
  toStatus: TaskStatus;
  /** The task that ends up immediately above the moved one, or null for the top of the column. */
  beforeId: string | null;
  /** The task that ends up immediately below the moved one, or null for the bottom. */
  afterId: string | null;
};

export type TaskMovePlan = {
  /** The optimistic list. */
  tasks: WsTaskRow[];
  /** The position the moved task now has. */
  position: number;
  /** Every position that must be saved. A rebalance returns the whole target column. */
  updates: Array<{ id: string; position: number }>;
};

/**
 * The optimistic result of moving one task. Throws when the task is not in the list, because a
 * move for a row that is gone is a bug, not a state to draw.
 */
export function planTaskMove(tasks: ReadonlyArray<WsTaskRow>, move: TaskMoveInput): TaskMovePlan {
  const result = applyMove(asCards(tasks), {
    id: move.id,
    toStage: move.toStatus,
    beforeId: move.beforeId,
    afterId: move.afterId,
  });

  return {
    tasks: asTasks(result.cards),
    position: result.position,
    updates: result.updates,
  };
}

/**
 * Where a task lands when it is moved to a column without being dropped: the end of that column,
 * ignoring the task itself. An empty column gives two nulls, which the ordering reads as "first".
 */
export function endOfColumn(
  tasks: ReadonlyArray<WsTaskRow>,
  toStatus: TaskStatus,
  excludeId: string,
): { beforeId: string | null; afterId: null } {
  const column = byPosition(
    tasks.filter((task) => task.status === toStatus && task.id !== excludeId),
  );
  return { beforeId: column[column.length - 1]?.id ?? null, afterId: null };
}
