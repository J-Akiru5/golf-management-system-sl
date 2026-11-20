import { MoveRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import type { WsTaskRow } from "@/lib/db/types";
import { dueLabel, isOverdue } from "@/lib/tasks/logic";
import { PriorityBadge } from "./task-badges";

/**
 * One task on the board. The title opens the detail sheet and the footer has the non-drag way to
 * move it.
 *
 * The kanban draws the drag handle in the card's top-right corner, so the title reserves room
 * there (about 3rem) and the touch target stays 44px. The column already says the status, so the
 * card shows the priority, the assignee and the due date instead.
 */
export function TaskBoardCard({
  task,
  assigneeName,
  today,
  onOpen,
  onMove,
}: {
  task: WsTaskRow;
  /** Null when the task has no assignee or the member is no longer in the list. */
  assigneeName: string | null;
  today: string;
  onOpen: () => void;
  onMove: () => void;
}) {
  const late = isOverdue(task, today);

  return (
    <Card className="p-3">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${task.title}`}
        className="min-w-0 rounded-sm pr-10 text-left"
      >
        <span className="line-clamp-2 font-display text-sm font-bold leading-tight text-ink">
          {task.title}
        </span>
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <PriorityBadge priority={task.priority} />
        <span
          className={
            late ? "tnum text-[12px] font-semibold text-danger" : "tnum text-[12px] text-ink-muted"
          }
        >
          {dueLabel(task, today)}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.assignee_id === null ? (
            <span className="text-[12px] text-ink-muted">Unassigned</span>
          ) : assigneeName === null ? (
            <span className="text-[12px] text-ink-muted">Unknown member</span>
          ) : (
            <>
              <Avatar id={task.assignee_id} name={assigneeName} size="sm" />
              <span className="truncate text-[12px] text-ink-muted">{assigneeName}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onMove}
          aria-label={`Move ${task.title} to another status`}
          className="inline-flex h-11 flex-none items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink sm:h-8"
        >
          <MoveRight className="size-3.5" aria-hidden="true" />
          Move to...
        </button>
      </div>
    </Card>
  );
}
