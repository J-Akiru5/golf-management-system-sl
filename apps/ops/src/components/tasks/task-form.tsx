"use client";

import type { ChangeEvent } from "react";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/db/constants";
import type { TaskPriority, TaskStatus, WsTaskRow } from "@/lib/db/types";
import type { TaskCardOption, TaskDraft, TaskMember, TaskPatch } from "@/lib/tasks/types";

/** The form's own shape: every control is a string, and "" means "not set". */
export type TaskFormValues = {
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  priority: TaskPriority;
  pipelineCardId: string;
  status: TaskStatus;
};

export function emptyTaskForm(): TaskFormValues {
  return {
    title: "",
    description: "",
    assigneeId: "",
    dueDate: "",
    priority: "normal",
    pipelineCardId: "",
    status: "todo",
  };
}

export function valuesFromTask(task: WsTaskRow): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    assigneeId: task.assignee_id ?? "",
    dueDate: task.due_date ?? "",
    priority: task.priority,
    pipelineCardId: task.pipeline_card_id ?? "",
    status: task.status,
  };
}

export function draftFromValues(values: TaskFormValues): TaskDraft {
  return {
    title: values.title.trim(),
    description: values.description.trim() === "" ? null : values.description.trim(),
    assigneeId: values.assigneeId === "" ? null : values.assigneeId,
    dueDate: values.dueDate === "" ? null : values.dueDate,
    priority: values.priority,
    pipelineCardId: values.pipelineCardId === "" ? null : values.pipelineCardId,
  };
}

export function patchFromValues(values: TaskFormValues): TaskPatch {
  return {
    ...draftFromValues(values),
    status: values.status,
  };
}

/** A plain message for the one required field. */
export function titleProblem(values: TaskFormValues): string | null {
  return values.title.trim() === "" ? "A task needs a title." : null;
}

export function TaskFormFields({
  idPrefix,
  values,
  onChange,
  members,
  cards,
  includeStatus = false,
}: {
  idPrefix: string;
  values: TaskFormValues;
  onChange: (values: TaskFormValues) => void;
  members: ReadonlyArray<TaskMember>;
  cards: ReadonlyArray<TaskCardOption>;
  includeStatus?: boolean;
}) {
  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  function onSelect<K extends keyof TaskFormValues>(key: K) {
    return (event: ChangeEvent<HTMLSelectElement>) =>
      set(key, event.target.value as TaskFormValues[K]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input
          id={`${idPrefix}-title`}
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          maxLength={200}
          placeholder="What needs doing"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          rows={4}
          placeholder="Any detail the person needs"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-assignee`}>Assignee</Label>
          <Select
            id={`${idPrefix}-assignee`}
            value={values.assigneeId}
            onChange={onSelect("assigneeId")}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-due`}>Due date</Label>
          <Input
            id={`${idPrefix}-due`}
            type="date"
            value={values.dueDate}
            onChange={(event) => set("dueDate", event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-priority`}>Priority</Label>
          <Select
            id={`${idPrefix}-priority`}
            value={values.priority}
            onChange={onSelect("priority")}
          >
            {TASK_PRIORITIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>

        {includeStatus ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-status`}>Status</Label>
            <Select id={`${idPrefix}-status`} value={values.status} onChange={onSelect("status")}>
              {TASK_STATUSES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-card`}>Pipeline card</Label>
          <Select
            id={`${idPrefix}-card`}
            value={values.pipelineCardId}
            onChange={onSelect("pipelineCardId")}
          >
            <option value="">No card</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.title}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
