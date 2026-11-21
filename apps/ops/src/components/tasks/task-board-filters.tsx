"use client";

import { Label, Select } from "@/components/ui/field";
import { TASK_VIEWS, type TaskView } from "@/lib/tasks/logic";
import type { TaskMember } from "@/lib/tasks/types";

/**
 * The board's filter: the same views the list tabs use, as one labelled pair of native selects.
 *
 * It is a select rather than a second row of buttons because the board sits under the tab strip,
 * which already shows those four words. A native select also keeps the row to one control on a
 * phone, and a phone opens its own picker.
 */
export function TaskBoardFilters({
  view,
  onViewChange,
  members,
  assigneeId,
  onAssigneeChange,
  githubOnly,
  onGithubOnlyChange,
  githubCount,
}: {
  view: TaskView;
  onViewChange: (view: TaskView) => void;
  members: ReadonlyArray<TaskMember>;
  assigneeId: string;
  onAssigneeChange: (id: string) => void;
  /** True when the board is narrowed to tasks linked to a GitHub issue. */
  githubOnly: boolean;
  onGithubOnlyChange: (value: boolean) => void;
  /** How many tasks in the current view are linked, so the filter is worth offering. */
  githubCount: number;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="board-view-filter" className="text-[12px] text-ink-muted">
          Show tasks
        </Label>
        <Select
          id="board-view-filter"
          value={view}
          onChange={(event) => onViewChange(event.target.value as TaskView)}
          className="w-auto min-w-[10.5rem]"
        >
          {TASK_VIEWS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </Select>
      </div>

      {view === "assignee" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="board-assignee" className="text-[12px] text-ink-muted">
            Assignee
          </Label>
          <Select
            id="board-assignee"
            value={assigneeId}
            onChange={(event) => onAssigneeChange(event.target.value)}
            className="w-auto max-w-[13rem] min-w-[10rem]"
          >
            {members.length === 0 ? <option value="">No members</option> : null}
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <label className="flex min-h-11 items-center gap-2 self-end text-[13px] text-ink">
        <input
          type="checkbox"
          checked={githubOnly}
          onChange={(event) => onGithubOnlyChange(event.currentTarget.checked)}
          className="size-5 rounded-sm"
        />
        <span>
          Linked to GitHub
          {githubCount === 0 ? null : (
            <span className="tnum ml-1 text-ink-muted">({githubCount})</span>
          )}
        </span>
      </label>
    </div>
  );
}
