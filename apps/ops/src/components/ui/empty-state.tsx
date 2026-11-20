import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/**
 * What a page shows when there is nothing to list yet, or while a workstream is still being built.
 * Plain words, one action at most.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-line bg-surface-raised px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="grid size-11 place-items-center rounded-full bg-surface-sunken text-ink-muted">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {children ? <div className="max-w-prose text-sm text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
