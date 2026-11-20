import { formatMoney } from "@/lib/board/format";
import type { MoneyTotal, PipelineSummary } from "@/lib/overview/summary";
import { OverviewCard } from "./overview-card";

/**
 * One line per stage: the count, and the quoted value when the cards in that stage carry one. The
 * open figure above the closed stage is the pipeline the team is still working on.
 */
function totalsText(totals: MoneyTotal[]): string | null {
  if (totals.length === 0) return null;
  return totals.map((entry) => formatMoney(entry.amount, entry.currency)).join(" + ");
}

function cardCount(count: number): string {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

export function PipelineCard({ summary }: { summary: PipelineSummary }) {
  const openText = totalsText(summary.openTotals);

  return (
    <OverviewCard
      title="Pipeline"
      description="Cards per stage, with the quoted value where there is one."
      href="/board"
      linkLabel="Open board"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1">
        <span className="overline">Stage</span>
        <span className="overline">Cards</span>
      </div>

      <ul className="flex flex-col divide-y divide-line">
        {summary.stages.map((stage) => (
          <li
            key={stage.stage}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 py-2"
          >
            <span className="truncate text-sm text-ink">{stage.label}</span>
            <span className="tnum text-sm font-semibold text-ink">{stage.count}</span>
            <span className="tnum text-xs text-ink-muted">
              {totalsText(stage.totals) ?? "No quoted value"}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-2">
        <span className="text-sm font-semibold text-ink">Open stages</span>
        <span className="tnum text-xs text-ink-muted">
          {cardCount(summary.openCount)}
          {openText === null ? ", no quoted value" : `, ${openText}`}
        </span>
      </div>
    </OverviewCard>
  );
}
