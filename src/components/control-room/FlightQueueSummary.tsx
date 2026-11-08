import Link from "next/link";
import type { FlightQueueModel } from "@/lib/draw/flight-queue";
import { cn } from "@/lib/ui/cn";

export interface FlightQueueSummaryProps {
  model: FlightQueueModel;
  href?: string;
  className?: string;
}

/**
 * A compact read of the same queue model for the overview rail: flight order, group and player
 * totals, and the vacant holes at each wave. It has no controls; the panel owns the moves.
 */
export function FlightQueueSummary({ model, href = "/draw", className }: FlightQueueSummaryProps) {
  return (
    <section aria-label="Flight queue" className={cn("card", className)}>
      <h3 className="text-[17px]">Flight queue</h3>

      {model.flights.length === 0 ? (
        <p className="hint mt-2">No draw yet.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
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
                  {flight.groups} groups · {flight.players} players
                </span>
              </div>
              <ul className="mt-0.5 grid gap-0.5 text-[12px] text-ink-muted">
                {flight.waves.map((wave) => (
                  <li key={wave.time}>
                    <span className="mono text-ink">{wave.time}</span>: {wave.groups} groups,{" "}
                    {wave.vacantHoles.length} vacant
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
    </section>
  );
}
