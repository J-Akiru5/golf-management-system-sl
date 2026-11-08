"use client";

import type { FlightQueueModel, QueueEntry } from "@/lib/draw/flight-queue";
import { cn } from "@/lib/ui/cn";

export interface FlightQueuePanelProps {
  model: FlightQueueModel;
  readOnly?: boolean;
  onMoveToHole?: (groupNumber: number, hole: number) => void;
  onSwap?: (groupA: number, groupB: number) => void;
  onReorder?: (hole: number, orderedGroupNumbers: number[]) => void;
  className?: string;
}

/** "all holes used" reads better than "0 vacant holes" on a full wave. */
function vacantLabel(count: number): string {
  if (count === 0) return "all holes used";
  return `${count} vacant hole${count === 1 ? "" : "s"}`;
}

function groupLabel(count: number): string {
  return `${count} group${count === 1 ? "" : "s"}`;
}

function Chip({
  entry,
  flightName,
  hole,
  index,
  entries,
  holes,
  otherGroups,
  readOnly,
  onMoveToHole,
  onSwap,
  onReorder,
}: {
  entry: QueueEntry;
  flightName: string;
  hole: number;
  index: number;
  entries: readonly QueueEntry[];
  holes: number[];
  otherGroups: number[];
  readOnly: boolean;
  onMoveToHole?: (groupNumber: number, hole: number) => void;
  onSwap?: (groupA: number, groupB: number) => void;
  onReorder?: (hole: number, orderedGroupNumbers: number[]) => void;
}) {
  const order = entries.map((item) => item.groupNumber);
  const last = entries.length - 1;
  const moveToHole = onMoveToHole;
  const swap = onSwap;
  const reorder = onReorder;

  return (
    <li className="min-w-0 rounded-[10px] border border-line bg-surface-raised p-2 text-[13px] text-ink hover:bg-fairway-soft">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">G{entry.groupNumber}</span>
        <span className="text-ink-muted" aria-hidden="true">
          ·
        </span>
        <span>{flightName}</span>
        <span className="text-ink-muted" aria-hidden="true">
          ·
        </span>
        <span className="mono">{entry.time}</span>
        {entry.locked && <span className="pill gold">Locked</span>}
      </p>

      {!readOnly && (moveToHole || swap || reorder) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {moveToHole && (
            <select
              aria-label={`Move group ${entry.groupNumber} to hole`}
              className="h-9 min-h-[44px] w-auto max-w-full font-semibold md:h-8 md:min-h-0 md:text-[13px]"
              value={entry.startHole}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (Number.isInteger(next)) moveToHole(entry.groupNumber, next);
              }}
            >
              {holes.map((option) => (
                <option key={option} value={option}>
                  Hole {option}
                </option>
              ))}
            </select>
          )}

          {swap && otherGroups.length > 0 && (
            <select
              aria-label={`Swap group ${entry.groupNumber} with`}
              className="h-9 min-h-[44px] w-auto max-w-full font-semibold md:h-8 md:min-h-0 md:text-[13px]"
              defaultValue=""
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (Number.isInteger(next) && next > 0) swap(entry.groupNumber, next);
              }}
            >
              <option value="">Swap with...</option>
              {otherGroups.map((option) => (
                <option key={option} value={option}>
                  Group {option}
                </option>
              ))}
            </select>
          )}

          {reorder && entries.length > 1 && (
            <span className="inline-flex gap-1">
              <button
                type="button"
                className="btn small ghost min-h-[44px] px-2 md:min-h-0"
                aria-label={`Move group ${entry.groupNumber} earlier in the queue`}
                disabled={index === 0}
                onClick={() => {
                  const next = [...order];
                  const [moved] = next.splice(index, 1);
                  if (moved === undefined) return;
                  next.splice(index - 1, 0, moved);
                  reorder(hole, next);
                }}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                className="btn small ghost min-h-[44px] px-2 md:min-h-0"
                aria-label={`Move group ${entry.groupNumber} later in the queue`}
                disabled={index === last}
                onClick={() => {
                  const next = [...order];
                  const [moved] = next.splice(index, 1);
                  if (moved === undefined) return;
                  next.splice(index + 1, 0, moved);
                  reorder(hole, next);
                }}
              >
                <span aria-hidden="true">↓</span>
              </button>
            </span>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The flight queue: where each flight sits in the order, how many holes each wave uses, and who
 * waits on every hole. It only reads the ready model and reports organizer actions upwards.
 */
export function FlightQueuePanel({
  model,
  readOnly = false,
  onMoveToHole,
  onSwap,
  onReorder,
  className,
}: FlightQueuePanelProps) {
  const holes = Array.from({ length: model.holes }, (_, index) => index + 1);
  const queueByHole = new Map(model.byHole.map((queue) => [queue.hole, queue]));
  const flightNameById = new Map(
    model.flights.map((flight) => [flight.flightId, flight.flightName]),
  );
  const allGroups = [
    ...new Set(model.byHole.flatMap((queue) => queue.entries.map((entry) => entry.groupNumber))),
  ].sort((a, b) => a - b);

  return (
    <section aria-label="Flight queue" className={cn("card", className)}>
      <h2 className="text-[17px]">Flight queue</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-muted">
        Flight order, the holes each wave uses, and the queue on every hole.
      </p>

      {model.flights.length === 0 ? (
        <p className="hint mt-3">No flights in the queue yet.</p>
      ) : (
        <ul className="mt-3 grid gap-2.5">
          {model.flights.map((flight) => (
            <li
              key={flight.flightId}
              className="min-w-0 rounded-[12px] border border-line bg-surface-sunken p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold text-ink">
                  Flight {flight.flightName} · queue {flight.position}
                </h3>
                <span className="pill">
                  {groupLabel(flight.groups)} · {flight.players} players
                </span>
              </div>
              <ul className="mt-1.5 grid gap-1 text-[13px] text-ink-muted">
                {flight.waves.map((wave) => (
                  <li key={wave.time} className="flex flex-wrap items-center gap-x-1.5">
                    <span className="mono text-ink">{wave.time}</span>
                    <span>· {groupLabel(wave.groups)}</span>
                    <span>·</span>
                    <span
                      title={
                        wave.vacantHoles.length > 0
                          ? `Vacant holes: ${wave.vacantHoles.join(", ")}`
                          : "Every hole is used at this start"
                      }
                    >
                      {vacantLabel(wave.vacantHoles.length)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <h3 className="small-h">Holes</h3>
        <ul className="mt-2 grid gap-2">
          {holes.map((hole) => {
            const entries = queueByHole.get(hole)?.entries ?? [];
            return (
              <li key={hole} className="min-w-0 rounded-[12px] border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-[14px] font-semibold text-ink">Hole {hole}</h4>
                  {entries.length === 0 && (
                    <span className="text-[13px] text-ink-muted">No start</span>
                  )}
                </div>
                {entries.length > 0 && (
                  <ol className="mt-2 flex flex-wrap gap-2">
                    {entries.map((entry, index) => (
                      <Chip
                        key={entry.groupNumber}
                        entry={entry}
                        flightName={flightNameById.get(entry.flightId) ?? "Other"}
                        hole={hole}
                        index={index}
                        entries={entries}
                        holes={holes}
                        otherGroups={allGroups.filter(
                          (groupNumber) => groupNumber !== entry.groupNumber,
                        )}
                        readOnly={readOnly}
                        onMoveToHole={onMoveToHole}
                        onSwap={onSwap}
                        onReorder={onReorder}
                      />
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
