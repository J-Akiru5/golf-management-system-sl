import Link from "next/link";
import type { TaskSummary } from "@/lib/overview/summary";
import { dueLabel, isOverdue } from "@/lib/tasks/logic";
import { cn } from "@/lib/ui/cn";
import { OverviewCard } from "./overview-card";

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="overline">{label}</dt>
      <dd
        className={cn(
          "tnum mt-1 font-display text-2xl font-bold",
          alert && value > 0 ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The viewer's work at a glance: three counts and the rows that are due soonest. Every row opens
 * the task list, which is where a task is edited.
 */
export function MyTasksCard({ summary, today }: { summary: TaskSummary; today: string }) {
  return (
    <OverviewCard
      title="My tasks"
      description="Your open work, and what is due next."
      href="/tasks"
      linkLabel="All tasks"
    >
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Open" value={summary.open} />
        <Stat label="Overdue" value={summary.overdue} alert />
        <Stat label="Unassigned" value={summary.unassigned} />
      </dl>

      {summary.nextDue.length === 0 ? (
        <p className="hint border-t border-line pt-3">
          {summary.open === 0
            ? "No tasks yet. New work is added on the tasks page."
            : "None of your open tasks has a due date."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {summary.nextDue.map((item) => {
            const late = isOverdue({ status: item.status, due_date: item.dueDate }, today);
            return (
              <li key={item.id}>
                <Link
                  href="/tasks"
                  className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {item.title}
                  </span>
                  <span
                    className={cn(
                      "tnum text-xs",
                      late ? "font-semibold text-danger" : "text-ink-muted",
                    )}
                  >
                    {dueLabel({ status: item.status, due_date: item.dueDate }, today)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}
