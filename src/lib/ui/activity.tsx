"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import type { DrawGroup } from "@/lib/store/desk-store";
import { useDesk } from "@/lib/store/desk-store";

export interface ActivityEntry {
  id: number;
  at: number;
  kind: "move" | "lock" | "unlock" | "draw" | "publish" | "unpublish" | "import" | "player";
  title: string;
  detail: string;
}

const Ctx = createContext<ActivityEntry[]>([]);

const holeCode = (g: DrawGroup) => `${g.startHole}${g.wave ?? ""}`;

/**
 * What happened on the desk during this browser session, worked out by comparing the store before
 * and after each change. It records real events only and forgets them on refresh, like the rest of
 * the demo. When the database lands, an activity table replaces this (see the backend handoff).
 */
export function ActivityProvider({ children }: { children: ReactNode }) {
  const { state, playerById } = useDesk();
  const [log, setLog] = useState<ActivityEntry[]>([]);
  const prev = useRef(state);
  const seq = useRef(0);

  useEffect(() => {
    const a = prev.current;
    const b = state;
    prev.current = b;
    if (a === b) return;
    const out: Omit<ActivityEntry, "id" | "at">[] = [];
    const name = (id: string) => playerById.get(id)?.name ?? "A player";

    if (!a.draw && b.draw) {
      out.push({ kind: "draw", title: "Draw made", detail: `${b.draw.length} groups` });
    } else if (a.draw && b.draw && a.draw !== b.draw) {
      if (a.draw.length !== b.draw.length || a.draw[0]?.number !== b.draw[0]?.number) {
        out.push({ kind: "draw", title: "Draw made again", detail: `${b.draw.length} groups` });
      } else {
        const where = (d: DrawGroup[]) => {
          const m = new Map<string, DrawGroup>();
          for (const g of d) for (const id of g.playerIds) m.set(id, g);
          return m;
        };
        const before = where(a.draw);
        for (const [id, g] of where(b.draw)) {
          const was = before.get(id);
          if (was?.number !== g.number) {
            out.push({
              kind: "move",
              title: `${name(id)} → Hole ${holeCode(g)}`,
              detail: was ? `Moved from Hole ${holeCode(was)}` : "Placed from the pool",
            });
          }
        }
        b.draw.forEach((g, i) => {
          const o = a.draw?.[i];
          if (o && o.locked !== g.locked) {
            out.push({
              kind: g.locked ? "lock" : "unlock",
              title: `Hole ${holeCode(g)} ${g.locked ? "locked" : "unlocked"}`,
              detail: `Group ${g.number}`,
            });
          }
        });
      }
    }
    if (!a.published && b.published) {
      out.push({ kind: "publish", title: "Pairings published", detail: "Players can see them" });
    } else if (a.published && b.published && a.published !== b.published) {
      out.push({ kind: "publish", title: "Changes published", detail: "Player view updated" });
    } else if (a.published && !b.published && b.draw) {
      out.push({
        kind: "unpublish",
        title: "Pairings taken down",
        detail: "Players see “not out yet”",
      });
    }
    if (b.importedCount > a.importedCount) {
      const n = b.importedCount - a.importedCount;
      out.push({
        kind: "import",
        title: "Handicap import applied",
        detail: `${n} player${n === 1 ? "" : "s"} matched`,
      });
    }
    if (b.players.length !== a.players.length) {
      const diff = b.players.length - a.players.length;
      out.push({
        kind: "player",
        title: diff > 0 ? "Player added" : "Player removed",
        detail: `${b.players.length} on the list`,
      });
    }
    if (out.length === 0) return;
    const now = Date.now();
    setLog((l) =>
      [...out.map((e) => ({ ...e, id: ++seq.current, at: now })).reverse(), ...l].slice(0, 30),
    );
  }, [state, playerById]);

  return <Ctx.Provider value={log}>{children}</Ctx.Provider>;
}

export const useActivity = () => useContext(Ctx);

/** "now", "2m", "1h". */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}
