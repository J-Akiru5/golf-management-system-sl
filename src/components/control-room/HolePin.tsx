"use client";

import { Lock, OctagonAlert, TriangleAlert, Unlock } from "lucide-react";
import Link from "next/link";
import { forwardRef, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { dropCheck } from "@/lib/draw/validate";
import { fmtHcp, fmtIndex, fmtTime, initials } from "@/lib/format";
import type { HoleSlot, PinStatus, useBoard } from "@/lib/ui/board";
import { cn } from "@/lib/ui/cn";

type Board = ReturnType<typeof useBoard>;

const DISC: Record<PinStatus, string> = {
  full: "bg-[#f7f5ee] text-[#171c19]",
  short: "bg-[#f29a4b] text-[#171c19]",
  blocking: "bg-[#ff7b70] text-[#171c19]",
  empty: "border border-[rgba(238,240,234,.7)] bg-transparent text-[#eef0ea]",
  selected: "bg-[#171c19] text-[#d7b568]",
};

/**
 * A flight marker on the course map: hole code in a disc, then the count or the problem. Status is
 * in the disc colour AND the words. Fixed dark-glass colours so it reads on imagery in any theme.
 */
export const HolePin = forwardRef<
  HTMLButtonElement,
  {
    code: string;
    label: string;
    status: PinStatus;
    /** Position on the map in px. Omit both to place the pin inline (the phone list). */
    x?: number;
    y?: number;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function HolePin({ code, label, status, x, y, className, ...props }, ref) {
  const inline = x === undefined || y === undefined;
  const sel = status === "selected";
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(
        inline ? "relative" : "absolute -translate-x-1/2 -translate-y-1/2",
        "flex items-center gap-1.5 rounded-full border py-0 pr-2.5 pl-1 text-xs font-semibold whitespace-nowrap backdrop-blur-[8px] transition-shadow",
        sel
          ? "z-10 h-[34px] border-[#d7b568] bg-[#d7b568] text-[#171c19] shadow-lift"
          : "h-[30px] border-[rgba(238,240,234,.18)] bg-[rgba(14,22,18,.66)] text-[#eef0ea] hover:border-[rgba(238,240,234,.45)]",
        className,
      )}
      style={inline ? undefined : { left: x, top: y }}
    >
      <span
        className={cn(
          "grid size-[22px] place-items-center rounded-full font-display text-[10.5px] font-extrabold tnum",
          DISC[status],
        )}
      >
        {code}
      </span>
      {label}
    </button>
  );
});

/** The selected hole's flight: who is on it, its problems, and a drop slot from the pool. */
export function HoleCard({ b, slot }: { b: Board; slot: HoleSlot }) {
  const { dispatch, regById, playerById, unplaced, names, draw, tournament } = b;
  const { group } = slot;
  const code = `${slot.hole}${slot.wave ?? ""}`;
  const config = tournament?.config;
  const size = config?.groupSize ?? 4;
  const [pick, setPick] = useState("");

  const candidates = useMemo(() => {
    if (!group || !draw || group.locked || !config) return [];
    return unplaced
      .map((r) => ({
        r,
        check: dropCheck(draw, config, regById, r.playerId, group.number, names),
      }))
      .filter((c) => c.check.ok);
  }, [group, draw, config, regById, unplaced, names]);

  const badge =
    slot.status === "blocking" ? (
      <span className="pill bad">Must fix</span>
    ) : slot.status === "short" ? (
      <span className="pill warn">
        {group?.playerIds.length} / {size}
      </span>
    ) : slot.status === "full" ? (
      <span className="pill ok">
        {group?.playerIds.length} / {size}
      </span>
    ) : (
      <span className="pill">Open</span>
    );

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-bold">Hole {code}</h4>
          <p className="text-xs text-ink-muted tnum">
            {group
              ? `${config?.startFormat === "shotgun" ? "Shotgun" : "Tee"} · ${fmtTime(group.time)} · ${names.flight(group.flightId)}`
              : "No group starts here"}
          </p>
        </div>
        {badge}
      </div>

      {slot.issues.length > 0 && (
        <ul className="mt-2.5 grid gap-1.5">
          {slot.issues.map((i) => (
            <li key={i.id} className="flex gap-2 text-[12.5px] leading-[17px]">
              {i.severity === "blocking" ? (
                <OctagonAlert className="mt-px size-3.5 shrink-0 text-danger" aria-hidden="true" />
              ) : (
                <TriangleAlert
                  className="mt-px size-3.5 shrink-0 text-warning"
                  aria-hidden="true"
                />
              )}
              {i.message}
            </li>
          ))}
        </ul>
      )}

      {group && (
        <ul className="mt-2.5 grid gap-1">
          {group.playerIds.map((id) => {
            const p = playerById.get(id);
            const r = regById.get(id);
            if (!p) return null;
            return (
              <li
                key={id}
                className="flex h-[34px] items-center gap-2 rounded-lg bg-[rgba(238,240,234,0.06)] px-2 text-[13px] font-medium"
              >
                <span className="grid size-[22px] place-items-center rounded-full bg-fairway-soft font-display text-[9px] font-extrabold text-fairway">
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-[10px] font-bold tracking-[.06em] text-ink-muted">HI</span>
                <span className="w-9 text-right font-bold tnum">
                  {fmtIndex(r?.frozenIndex ?? null)}
                </span>
                <span className="text-[10px] font-bold tracking-[.06em] text-ink-muted">PH</span>
                <span className="w-6 text-right font-bold tnum">
                  {fmtHcp(r?.playingHandicap ?? null)}
                </span>
              </li>
            );
          })}
          {Array.from({ length: Math.max(0, size - group.playerIds.length) }, (_, i) =>
            i === 0 && candidates.length > 0 && !group.locked ? (
              <li
                key="drop"
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-fairway bg-[color-mix(in_srgb,var(--fairway)_14%,transparent)] p-1.5"
              >
                <label htmlFor={`pick-${code}`} className="sr">
                  Add a player from the pool to Hole {code}
                </label>
                <select
                  id={`pick-${code}`}
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  className="!h-8 !rounded-md !border-0 !bg-transparent !px-1 text-[12.5px] font-semibold !text-fairway"
                >
                  <option value="">Drop to add · choose a player</option>
                  {candidates.map(({ r }) => (
                    <option key={r.playerId} value={r.playerId}>
                      {r.playerName} (HI {fmtIndex(r.frozenIndex)})
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!pick}
                  onClick={() => {
                    dispatch({
                      type: "move",
                      playerId: pick,
                      toGroup: group.number,
                      reason: "Added from the hole card",
                    });
                    setPick("");
                  }}
                >
                  Add
                </Button>
              </li>
            ) : (
              <li
                key={`open-${group.number}-${i}`}
                className="flex h-[34px] items-center justify-center rounded-lg border border-dashed border-[rgba(166,176,169,.55)] text-xs text-ink-muted"
              >
                Open slot
              </li>
            ),
          )}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        {group && (
          <Button
            size="sm"
            variant="glass"
            aria-pressed={group.locked}
            onClick={() =>
              dispatch({
                type: "setGroupLocked",
                group: group.number,
                locked: !group.locked,
                reason: "Locked from the hole card",
              })
            }
          >
            {group.locked ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />}
            {group.locked ? "Unlock" : "Lock"}
          </Button>
        )}
        <Button size="sm" variant="glass" asChild className="flex-1">
          <Link href={`/course?hole=${slot.hole}`}>Hole view</Link>
        </Button>
        <Button size="sm" variant="glass" asChild className="flex-1">
          <Link href="/draw">Open in draw</Link>
        </Button>
      </div>
    </div>
  );
}
