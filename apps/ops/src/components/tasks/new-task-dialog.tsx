"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { messageOf } from "@/lib/tasks/result";
import type { TaskCardOption, TaskDraft, TaskMember } from "@/lib/tasks/types";
import {
  draftFromValues,
  emptyTaskForm,
  TaskFormFields,
  type TaskFormValues,
  titleProblem,
} from "./task-form";

function NewTaskForm({
  members,
  cards,
  onCreate,
  onClose,
}: {
  members: ReadonlyArray<TaskMember>;
  cards: ReadonlyArray<TaskCardOption>;
  onCreate: (draft: TaskDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<TaskFormValues>(emptyTaskForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const problem = titleProblem(values);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onCreate(draftFromValues(values));
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TaskFormFields
        idPrefix="new-task"
        values={values}
        onChange={setValues}
        members={members}
        cards={cards}
      />

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Creating..." : "Create task"}
        </Button>
      </div>
    </form>
  );
}

/** "New task". Only the title is required; everything else can be filled in later. */
export function NewTaskDialog({
  open,
  onOpenChange,
  members,
  cards,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: ReadonlyArray<TaskMember>;
  cards: ReadonlyArray<TaskCardOption>;
  onCreate: (draft: TaskDraft) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New task" description="Only the title is required.">
        <NewTaskForm
          members={members}
          cards={cards}
          onCreate={onCreate}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
