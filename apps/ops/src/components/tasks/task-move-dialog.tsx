"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TASK_STATUSES } from "@/lib/db/constants";
import type { TaskStatus, WsTaskRow } from "@/lib/db/types";
import { cn } from "@/lib/ui/cn";

/**
 * Move a task to another column without dragging: a plain list of the four statuses. Every one is
 * a normal button, so a finger and a keyboard both work. The current status is shown but not
 * offered, because moving a task onto its own status would only change its place in the column.
 */
export function TaskMoveDialog({
  task,
  onPick,
  onClose,
}: {
  task: WsTaskRow | null;
  onPick: (status: TaskStatus) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {task === null ? null : (
        <DialogContent title="Move task" description={task.title}>
          <div className="flex flex-col gap-1.5">
            {TASK_STATUSES.map((status) => {
              const current = status.id === task.status;
              return (
                <button
                  key={status.id}
                  type="button"
                  disabled={current}
                  onClick={() => onPick(status.id)}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-left text-sm font-semibold",
                    current
                      ? "border-line bg-surface-sunken text-ink-muted"
                      : "border-line-strong text-ink hover:bg-surface-sunken",
                  )}
                >
                  <span>{status.label}</span>
                  {current ? <span className="text-[12px] font-normal">Current</span> : null}
                </button>
              );
            })}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
