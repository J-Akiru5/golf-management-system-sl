import Link from "next/link";
import type { FlightQueueModel } from "@/lib/draw/flight-queue";
import { fmtTime } from "@/lib/format";
import { Panel, type PanelVariant } from "./panels";

export interface FlightQueueSummaryProps {
  model: FlightQueueModel;
  href?: string;
  variant?: PanelVariant;
  className?: string;
}

const countOf = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * A compact read of the same queue model for the overview: each flight (a wave of groups, A then
 * B), its start, its groups and the vacant holes. It has no controls; the draw page owns the moves.
 */
export function FlightQueueSummary({
  model,
  href = "/draw",
  variant,
  className,
}: FlightQueueSummaryProps) {
  return (
    <Panel
      title="Flight queue"
      subtitle="Flight A is the first group on each hole, B the next."
      variant={variant}
      className={className}
      labelledBy={variant === "card" ? "queue-h-card" : "queue-h"}
    >
      {model.flights.length === 0 ? (
        <p className="hint">No draw yet.</p>
      ) : (
        <ul className="grid gap-2">
          {model.flights.map((flight) => (
            <li
              key={flight.key}
              className="min-w-0 rounded-[10px] border border-line bg-surface-sunken p-2.5 text-[13px] text-ink"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <b className="font-semibold">
                  {flight.session ? `${flight.session} ` : ""}
                  {flight.label}
                </b>
                <span className="mono text-[12px]">{fmtTime(flight.time)}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {countOf(flight.groups, "group")} · {flight.players} players ·{" "}
                {flight.vacantHoles.length === 0
                  ? "all holes used"
                  : `${flight.vacantHoles.length} vacant`}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Link href={href} className="btn small ghost mt-3 min-h-[44px] md:min-h-0">
        Open the draw
      </Link>
    </Panel>
  );
}
