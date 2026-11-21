"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { TASK_STATUSES } from "@/lib/db/constants";
import type { TaskStatus, WsTaskRow } from "@/lib/db/types";
import { readTaskLink } from "@/lib/github/links";
import { dueLabel, isOverdue } from "@/lib/tasks/logic";
import { GithubBadge } from "./github-badge";
import { PriorityBadge, StatusBadge } from "./task-badges";

export type TaskListProps = {
  tasks: WsTaskRow[];
  memberNames: ReadonlyMap<string, string>;
  cardTitles: ReadonlyMap<string, string>;
  today: string;
  onOpen: (id: string) => void;
  onStatus: (id: string, status: TaskStatus) => void;
  /** False at view level: the status is a badge, not a control. */
  canEdit?: boolean;
  empty: { title: string; body: string; action?: ReactNode };
};

function Assignee({ id, name }: { id: string | null; name: string | undefined }) {
  if (id === null) return <span className="text-ink-muted">Unassigned</span>;
  const label = name ?? "Former member";
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar id={id} name={label} size="sm" />
      <span className="truncate text-ink">{label}</span>
    </span>
  );
}

function cardLabel(task: WsTaskRow, cardTitles: ReadonlyMap<string, string>): string | null {
  if (task.pipeline_card_id === null) return null;
  return cardTitles.get(task.pipeline_card_id) ?? "Card not in the list";
}

function dueClass(late: boolean): string {
  return late ? "tnum font-semibold text-danger" : "tnum text-ink-muted";
}

function StatusSelect({
  task,
  onStatus,
}: {
  task: WsTaskRow;
  onStatus: (id: string, status: TaskStatus) => void;
}) {
  return (
    <Select
      value={task.status}
      aria-label={`Status for ${task.title}`}
      onChange={(event) => onStatus(task.id, event.target.value as TaskStatus)}
      className="w-[9.5rem] text-[13px]"
    >
      {TASK_STATUSES.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entry.label}
        </option>
      ))}
    </Select>
  );
}

function TitleButton({
  task,
  onOpen,
  className,
}: {
  task: WsTaskRow;
  onOpen: (id: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className={`text-left font-semibold text-ink hover:underline ${className ?? ""}`}
    >
      {task.title}
    </button>
  );
}

/**
 * The task rows. A table from 768px and a stack of cards on a phone. Both read the same list, so
 * the order and the labels can never disagree.
 */
export function TaskList({
  tasks,
  memberNames,
  cardTitles,
  today,
  onOpen,
  onStatus,
  canEdit = true,
  empty,
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState title={empty.title} action={empty.action}>
        {empty.body}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface-raised md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Task
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Priority
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Assignee
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Due
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Card
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const late = isOverdue(task, today);
                const card = cardLabel(task, cardTitles);
                const link = readTaskLink(task);
                return (
                  <tr key={task.id} className="border-t border-line hover:bg-surface-sunken/60">
                    <td className="px-3 py-2.5">
                      <TitleButton task={task} onOpen={onOpen} />
                      {link ? (
                        <div className="mt-1.5">
                          <GithubBadge link={link} compact />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {canEdit ? (
                        <StatusSelect task={task} onStatus={onStatus} />
                      ) : (
                        <StatusBadge status={task.status} />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="max-w-[13rem] px-3 py-2.5">
                      <Assignee
                        id={task.assignee_id}
                        name={task.assignee_id ? memberNames.get(task.assignee_id) : undefined}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className={dueClass(late)}>{dueLabel(task, today)}</span>
                    </td>
                    <td className="max-w-[12rem] px-3 py-2.5">
                      {card ? (
                        <span className="truncate text-ink-muted">{card}</span>
                      ) : (
                        <span className="text-ink-muted">None</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {tasks.map((task) => {
          const late = isOverdue(task, today);
          const card = cardLabel(task, cardTitles);
          const link = readTaskLink(task);
          return (
            <li
              key={task.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3"
            >
              <TitleButton
                task={task}
                onOpen={onOpen}
                className="flex min-h-11 w-full items-center"
              />
              {link ? <GithubBadge link={link} /> : null}
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                <span className={`text-[12px] ${dueClass(late)}`}>{dueLabel(task, today)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <Assignee
                  id={task.assignee_id}
                  name={task.assignee_id ? memberNames.get(task.assignee_id) : undefined}
                />
                {card ? <span className="text-ink-muted">{card}</span> : null}
              </div>
              <StatusSelect task={task} onStatus={onStatus} />
            </li>
          );
        })}
      </ul>
    </>
  );
}
