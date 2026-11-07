"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import type { DrawGroup } from "@/lib/store/desk-store";
import { useDesk } from "@/lib/store/desk-store";
import { boardOf } from "@/lib/store/state";

export interface ActivityEntry {
  id: number;
  at: number;
  kind:
    | "move"
    | "lock"
    | "unlock"
    | "draw"
    | "publish"
    | "unpublish"
    | "import"
    | "player"
    | "entry";
  title: string;
  detail: string;
}

const Ctx = createContext<ActivityEntry[]>([]);

const holeCode = (g: DrawGroup) => `${g.startHole}`;

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

    const boardA = boardOf(a);
    const boardB = boardOf(b);
    if (!boardA.draw && boardB.draw) {
      out.push({ kind: "draw", title: "Draw made", detail: `${boardB.draw.length} groups` });
    } else if (boardA.draw && boardB.draw && boardA.draw !== boardB.draw) {
      if (
        boardA.draw.length !== boardB.draw.length ||
        boardA.draw[0]?.number !== boardB.draw[0]?.number
      ) {
        out.push({
          kind: "draw",
          title: "Draw made again",
          detail: `${boardB.draw.length} groups`,
        });
      } else {
        const where = (d: DrawGroup[]) => {
          const m = new Map<string, DrawGroup>();
          for (const g of d) for (const id of g.playerIds) m.set(id, g);
          return m;
        };
        const before = where(boardA.draw);
        for (const [id, g] of where(boardB.draw)) {
          const was = before.get(id);
          if (was?.number !== g.number) {
            out.push({
              kind: "move",
              title: `${name(id)} → Hole ${holeCode(g)}`,
              detail: was ? `Moved from Hole ${holeCode(was)}` : "Placed from the pool",
            });
          }
        }
        boardB.draw.forEach((g, i) => {
          const o = boardA.draw?.[i];
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
    if (!boardA.published && boardB.published) {
      out.push({ kind: "publish", title: "Pairings published", detail: "Players can see them" });
    } else if (boardA.published && boardB.published && boardA.published !== boardB.published) {
      out.push({ kind: "publish", title: "Changes published", detail: "Player view updated" });
    } else if (boardA.published && !boardB.published && boardB.draw) {
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
        detail: `${n} record${n === 1 ? "" : "s"} written`,
      });
    }
    if (b.players.length !== a.players.length) {
      const diff = b.players.length - a.players.length;
      out.push({
        kind: "player",
        title: diff > 0 ? "Player added" : "Player removed",
        detail: `${b.players.length} in the directory`,
      });
    }
    if (b.entries.length !== a.entries.length) {
      const diff = b.entries.length - a.entries.length;
      out.push({
        kind: "entry",
        title: diff > 0 ? "Registration added" : "Registration removed",
        detail: `${b.entries.length} in this event`,
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
