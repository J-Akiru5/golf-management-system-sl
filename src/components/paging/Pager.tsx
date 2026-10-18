"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPaged, type Page, pageLabel } from "@/lib/data/paging";

/**
 * Previous / Next paging for a long list.
 *
 * Renders nothing when the list fits on one page, so a short list says nothing rather than offering
 * a control that does nothing. The range label is the same one the tests assert on.
 */
export function Pager<T>({
  page,
  onPage,
  className,
}: {
  page: Page<T>;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (!isPaged(page)) return null;

  return (
    <nav
      aria-label="Paging"
      // A pager belongs to the screen, never to a printed sheet. The print path shows the full
      // list anyway, but keeping the control out of print output makes that impossible to break.
      className={`no-print flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${className ?? ""}`}
    >
      <span className="text-[13px] text-ink-muted" role="status" aria-live="polite">
        {pageLabel(page)}
      </span>
      <span className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => onPage(page.page - 1)}
          disabled={!page.hasPrev}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => onPage(page.page + 1)}
          disabled={!page.hasNext}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </span>
    </nav>
  );
}
