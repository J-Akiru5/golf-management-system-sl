"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { can } from "@/lib/db/permissions";
import type { WsTaskRow } from "@/lib/db/types";
import { messageOf } from "@/lib/tasks/result";
import type { TaskCardOption, TaskMember, TaskPatch, TaskViewer } from "@/lib/tasks/types";
import { type CommentActions, CommentsThread } from "./comments-thread";
import {
  patchFromValues,
  TaskFormFields,
  type TaskFormValues,
  titleProblem,
  valuesFromTask,
} from "./task-form";

function TaskDetailBody({
  task,
  members,
  cards,
  viewer,
  commentActions,
  commentsRefresh,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: {
  task: WsTaskRow;
  members: ReadonlyArray<TaskMember>;
  cards: ReadonlyArray<TaskCardOption>;
  viewer: TaskViewer;
  commentActions: CommentActions;
  commentsRefresh: number;
  canEdit: boolean;
  onClose: () => void;
  onSave: (id: string, patch: TaskPatch) => Promise<WsTaskRow>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [values, setValues] = useState<TaskFormValues>(valuesFromTask(task));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
  const mayDelete = canEdit && can({ role: viewer.role, status: "active" }, "content.delete");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const problem = titleProblem(values);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const row = await onSave(task.id, patchFromValues(values));
      setValues(valuesFromTask(row));
      setNotice("Saved.");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await onDelete(task.id);
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {canEdit ? null : (
          <p className="hint">
            You can view this task but not change it. Ask an owner for edit access to tasks.
          </p>
        )}
        <fieldset disabled={!canEdit} className="flex flex-col gap-4">
          <TaskFormFields
            idPrefix="task-detail"
            values={values}
            onChange={setValues}
            members={members}
            cards={cards}
            includeStatus
          />

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              {notice ? (
                <span role="status" className="text-sm text-ink-muted">
                  {notice}
                </span>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>

      {mayDelete ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          {confirmDelete ? (
            <>
              <p className="text-sm text-ink">Delete this task and its comments?</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" disabled={saving} onClick={() => void handleDelete()}>
                  {saving ? "Deleting..." : "Delete task"}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete task
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <div className="border-t border-line pt-4">
        <CommentsThread
          taskId={task.id}
          memberNames={memberNames}
          viewer={viewer}
          actions={commentActions}
          refreshKey={commentsRefresh}
          canWrite={canEdit}
        />
      </div>
    </div>
  );
}

/**
 * One task in a side sheet: every field, a delete for owner and partner, and the comment thread.
 * The body is keyed by the task id, so opening another task starts from that task's values.
 */
export function TaskDetailSheet({
  task,
  members,
  cards,
  viewer,
  commentActions,
  commentsRefresh,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: {
  task: WsTaskRow | null;
  members: ReadonlyArray<TaskMember>;
  cards: ReadonlyArray<TaskCardOption>;
  viewer: TaskViewer;
  commentActions: CommentActions;
  commentsRefresh: number;
  /** False at view level: the fields and the thread are read only, with no save or delete. */
  canEdit: boolean;
  onClose: () => void;
  onSave: (id: string, patch: TaskPatch) => Promise<WsTaskRow>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Sheet
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent title={task?.title ?? "Task"} description="Task details and comments">
        {task ? (
          <TaskDetailBody
            key={task.id}
            task={task}
            members={members}
            cards={cards}
            viewer={viewer}
            commentActions={commentActions}
            commentsRefresh={commentsRefresh}
            canEdit={canEdit}
            onClose={onClose}
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
