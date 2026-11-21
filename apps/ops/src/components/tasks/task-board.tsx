"use client";

import { useEffect, useMemo, useState } from "react";
import { Kanban, type KanbanMove } from "@/components/kanban/kanban";
import { Badge } from "@/components/ui/badge";
import type { TaskStatus, WsTaskRow } from "@/lib/db/types";
import {
  endOfColumn,
  filterBoardTasks,
  groupTasksByStatus,
  isTaskStatus,
  TASK_BOARD_COLUMNS,
  toBoardItems,
} from "@/lib/tasks/board";
import { isOverdue, type TaskView } from "@/lib/tasks/logic";
import type { TaskMember } from "@/lib/tasks/types";
import { TaskBoardCard } from "./task-board-card";
import { TaskBoardFilters } from "./task-board-filters";
import { TaskMoveDialog } from "./task-move-dialog";

/** What the board asks for when a task moves: its new column and its neighbours there. */
export type TaskBoardMove = {
  id: string;
  toStatus: TaskStatus;
  beforeId: string | null;
  afterId: string | null;
};

/**
 * The tasks as a kanban, one column per status.
 *
 * The board filters its own rows with the same views the list tabs use. A drop and the Move menu
 * both end as one `onMove` call carrying the target column and the neighbours, so the caller owns
 * the optimistic write, the rollback and the message. The board draws what it is given.
 */
export function TaskBoard({
  tasks,
  members,
  viewerId,
  today,
  onOpen,
  onMove,
  canEdit,
}: {
  tasks: WsTaskRow[];
  members: ReadonlyArray<TaskMember>;
  viewerId: string;
  today: string;
  onOpen: (id: string) => void;
  onMove: (move: TaskBoardMove) => void;
  /** False at view level: the card opens but nothing can be dragged or moved. */
  canEdit: boolean;
}) {
  const [view, setView] = useState<TaskView>("mine");
  const [assigneeId, setAssigneeId] = useState<string>(() => {
    if (members.some((member) => member.id === viewerId)) return viewerId;
    return members[0]?.id ?? "";
  });
  const [movingId, setMovingId] = useState<string | null>(null);

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.id, member.displayName])),
    [members],
  );

  const visible = useMemo(
    () => filterBoardTasks(tasks, view, viewerId, assigneeId, today),
    [tasks, view, viewerId, assigneeId, today],
  );
  const groups = useMemo(() => groupTasksByStatus(visible), [visible]);
  const items = useMemo(() => toBoardItems(visible), [visible]);

  const movingTask =
    movingId === null ? null : (tasks.find((task) => task.id === movingId) ?? null);

  // A task can be deleted elsewhere while its Move dialog is open.
  useEffect(() => {
    if (movingId !== null && movingTask === null) setMovingId(null);
  }, [movingId, movingTask]);

  function handleDrag(move: KanbanMove) {
    if (!isTaskStatus(move.toColumnId)) return;
    onMove({
      id: move.id,
      toStatus: move.toColumnId,
      beforeId: move.beforeId,
      afterId: move.afterId,
    });
  }

  function handlePick(status: TaskStatus) {
    if (movingTask === null) return;
    // The Move menu adds to the end of the column. Positions come from every task in it, not only
    // the ones this filter shows, so the move cannot land in the middle of a hidden card.
    const target = endOfColumn(tasks, status, movingTask.id);
    setMovingId(null);
    onMove({ id: movingTask.id, toStatus: status, ...target });
  }

  return (
    <div className="flex flex-col gap-3">
      <TaskBoardFilters
        view={view}
        onViewChange={setView}
        members={members}
        assigneeId={assigneeId}
        onAssigneeChange={setAssigneeId}
      />

      <Kanban
        columns={TASK_BOARD_COLUMNS}
        items={items}
        onMove={handleDrag}
        disabled={!canEdit}
        getItemLabel={(item) => item.title}
        emptyLabel="No tasks"
        renderColumnHeader={(column, count) => {
          const late = isTaskStatus(column.id)
            ? (groups.get(column.id) ?? []).filter((task) => isOverdue(task, today)).length
            : 0;
          return (
            <div className="flex w-full items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-ink">{column.label}</h2>
              <div className="flex items-center gap-1.5">
                {late === 0 ? null : (
                  <span className="tnum text-[11.5px] font-semibold text-danger">
                    {late} overdue
                  </span>
                )}
                <Badge tone="neutral" className="tnum">
                  {count}
                </Badge>
              </div>
            </div>
          );
        }}
        renderCard={(item) => (
          <TaskBoardCard
            task={item}
            assigneeName={
              item.assignee_id === null ? null : (memberNames.get(item.assignee_id) ?? null)
            }
            today={today}
            onOpen={() => onOpen(item.id)}
            onMove={canEdit ? () => setMovingId(item.id) : undefined}
          />
        )}
      />

      {visible.length === 0 && tasks.length > 0 ? (
        <p className="text-sm text-ink-muted">
          No tasks match this filter. Choose another one to see the whole board.
        </p>
      ) : null}

      <TaskMoveDialog task={movingTask} onPick={handlePick} onClose={() => setMovingId(null)} />
    </div>
  );
}
