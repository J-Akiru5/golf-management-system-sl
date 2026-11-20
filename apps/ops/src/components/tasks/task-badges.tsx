import { Badge } from "@/components/ui/badge";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/db/constants";
import type { TaskPriority, TaskStatus } from "@/lib/db/types";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "gold";

const STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  todo: "neutral",
  in_progress: "info",
  blocked: "danger",
  done: "success",
};

const PRIORITY_TONE: Record<TaskPriority, BadgeTone> = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  urgent: "danger",
};

export function statusLabel(status: TaskStatus): string {
  return TASK_STATUSES.find((entry) => entry.id === status)?.label ?? status;
}

export function priorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITIES.find((entry) => entry.id === priority)?.label ?? priority;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{statusLabel(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{priorityLabel(priority)}</Badge>;
}
