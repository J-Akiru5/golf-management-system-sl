"use client";

import { ExternalLink } from "lucide-react";
import { itemDatesLabel } from "@/lib/timeline/items";
import type { TimelineItem } from "@/lib/timeline/types";
import { cn } from "@/lib/ui/cn";
import { KIND_STYLE } from "./kind-style";

/**
 * One item as a tappable row. At least 44px tall, with the kind's dot, the title, the second line
 * and the dates. An external link (a tournament's public page, GitHub) says it opens in a new tab.
 */
export function TimelineItemLink({
  item,
  showDates = true,
  className,
}: {
  item: TimelineItem;
  showDates?: boolean;
  className?: string;
}) {
  const external = item.href !== null && /^https?:\/\//.test(item.href);
  const style = KIND_STYLE[item.kind];

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn("mt-1.5 size-2.5 flex-none rounded-full", style.dot)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
        <span className="block truncate text-[13px] text-ink-muted">
          {item.detail === null ? null : `${item.detail} · `}
          {showDates ? itemDatesLabel(item) : null}
        </span>
      </span>
      {external ? (
        <ExternalLink className="size-4 flex-none text-ink-muted" aria-hidden="true" />
      ) : null}
    </>
  );

  const classes = cn(
    "flex min-h-11 items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-sunken focus-visible:outline-none",
    className,
  );

  if (item.href === null) {
    return <div className={classes}>{body}</div>;
  }

  return (
    <a
      href={item.href}
      className={classes}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {body}
      {external ? <span className="sr-only">(opens in a new tab)</span> : null}
    </a>
  );
}
