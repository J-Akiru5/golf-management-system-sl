import Link from "next/link";
import type { FlightQueueModel } from "@/lib/draw/flight-queue";
import { Panel, type PanelVariant } from "./panels";

export interface FlightQueueSummaryProps {
  model: FlightQueueModel;
  href?: string;
  variant?: PanelVariant;
  className?: string;
}

const countOf = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * A compact read of the same queue model for the overview: flight order, group and player totals,
 * and the vacant holes at each wave. It has no controls; the draw page owns the moves.
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
      subtitle="Each flight goes out in its own wave, in this order."
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
              key={flight.flightId}
              className="min-w-0 rounded-[10px] border border-line bg-surface-sunken p-2.5 text-[13px] text-ink"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <b className="font-semibold">
                  Queue {flight.position} · Flight {flight.flightName}
                </b>
                <span className="text-[12px] text-ink-muted">
                  {countOf(flight.groups, "group")} · {flight.players} players
                </span>
              </div>
              <ul className="mt-0.5 grid gap-0.5 text-[12px] text-ink-muted">
                {flight.waves.map((wave) => (
                  <li key={wave.time}>
                    <span className="mono text-ink">{wave.time}</span>:{" "}
                    {countOf(wave.groups, "group")}, {wave.vacantHoles.length} vacant
                  </li>
                ))}
              </ul>
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
