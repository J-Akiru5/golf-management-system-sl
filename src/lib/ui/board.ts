"use client";

import { useMemo } from "react";
import { type Issue, validateDraw } from "@/lib/draw/validate";
import type { DrawGroup } from "@/lib/store/desk-store";
import { useDesk } from "@/lib/store/desk-store";

export type PinStatus = "full" | "short" | "blocking" | "empty" | "selected";

export interface HoleSlot {
  hole: number;
  time: string | null;
  group: DrawGroup | null;
  status: Exclude<PinStatus, "selected">;
  label: string;
  issues: Issue[];
}

/**
 * Everything the control room reads, derived from the desk store in one place so every panel
 * agrees: issues, counts, and what sits on each hole.
 */
export function useBoard() {
  const desk = useDesk();
  const { registrations, names, draw, warnings, tournament, flags } = desk;
  const config = tournament?.config ?? null;

  return useMemo(() => {
    const issues =
      draw && config
        ? validateDraw({
            draw,
            registrations,
            config,
            engineWarnings: warnings,
            flags,
            names,
          })
        : [];
    const blocking = issues.filter((i) => i.severity === "blocking");
    const warningsList = issues.filter((i) => i.severity === "warning");
    const byGroup = new Map<number, Issue[]>();
    for (const i of issues) if (i.group) byGroup.set(i.group, [...(byGroup.get(i.group) ?? []), i]);

    const ready = registrations.filter((r) => r.status === "ok");
    const review = registrations.filter((r) => r.status === "needs_review");
    const ineligible = registrations.filter((r) => r.status === "ineligible");
    const placed = draw?.reduce((n, g) => n + g.playerIds.length, 0) ?? 0;
    const groupSize = config?.groupSize ?? 4;
    const full = draw?.filter((g) => g.playerIds.length >= groupSize).length ?? 0;
    const short =
      draw?.filter((g) => g.playerIds.length > 0 && g.playerIds.length < groupSize).length ?? 0;
    const over = draw?.filter((g) => g.playerIds.length > groupSize).length ?? 0;
    const withIndex = registrations.filter((r) => r.index !== null).length;
    const startTimes = [...new Set((draw ?? []).map((g) => g.time))].sort();

    const slot = (hole: number, time: string | null): HoleSlot => {
      const group =
        draw?.find(
          (g) =>
            g.startHole === hole && (config?.startFormat === "shotgun" ? g.time === time : true),
        ) ?? null;
      const gi = group ? (byGroup.get(group.number) ?? []) : [];
      const n = group?.playerIds.length ?? 0;
      if (!group || n === 0)
        return { hole, time, group, status: "empty", label: "Open", issues: gi };
      if (gi.some((i) => i.severity === "blocking"))
        return { hole, time, group, status: "blocking", label: "Must fix", issues: gi };
      if (n < groupSize)
        return { hole, time, group, status: "short", label: `${n}/${groupSize}`, issues: gi };
      return { hole, time, group, status: "full", label: `${n}/${groupSize}`, issues: gi };
    };

    return {
      ...desk,
      issues,
      blocking,
      warnings: warningsList,
      byGroup,
      ready,
      review,
      ineligible,
      placed,
      full,
      short,
      over,
      withIndex,
      startTimes,
      slot,
    };
  }, [desk, draw, registrations, config, warnings, names, flags]);
}
