"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useReducer } from "react";
import {
  DEMO_CATEGORIES,
  DEMO_CONFIG,
  DEMO_FLIGHTS,
  DEMO_TEES,
  type DeskPlayer,
  makeDemoPlayers,
} from "@/lib/demo/data";
import type { ImportRecord } from "@/lib/ngap";
import {
  classifyPlayer,
  type Group,
  type Registration,
  route,
  type TournamentConfig,
} from "@/lib/routing";

export interface DrawGroup extends Group {
  locked: boolean;
}

interface DeskState {
  name: string;
  config: TournamentConfig;
  players: DeskPlayer[];
  draw: DrawGroup[] | null;
  drawWarnings: string[];
  published: boolean;
  importedCount: number;
}

type Action =
  | { type: "addPlayer"; player: DeskPlayer }
  | { type: "removePlayer"; id: string }
  | { type: "setConfig"; config: Partial<TournamentConfig> }
  | { type: "applyImport"; records: ImportRecord[] }
  | { type: "generate" }
  | { type: "move"; playerId: string; toGroup: number }
  | { type: "lock"; group: number }
  | { type: "publish"; value: boolean };

const routingInput = (s: Pick<DeskState, "players" | "config">) => ({
  players: s.players,
  config: s.config,
  tees: DEMO_TEES,
  categories: DEMO_CATEGORIES,
  flights: DEMO_FLIGHTS,
});

function reducer(state: DeskState, a: Action): DeskState {
  switch (a.type) {
    case "addPlayer":
      return { ...state, players: [...state.players, a.player] };
    case "removePlayer":
      return {
        ...state,
        players: state.players.filter((p) => p.id !== a.id),
        draw:
          state.draw?.map((g) => ({ ...g, playerIds: g.playerIds.filter((id) => id !== a.id) })) ??
          null,
      };
    case "setConfig":
      return { ...state, config: { ...state.config, ...a.config } };
    case "applyImport": {
      const byId = new Map(a.records.filter((r) => r.playerId).map((r) => [r.playerId, r]));
      let n = 0;
      const players = state.players.map((p) => {
        const rec = byId.get(p.id);
        if (!rec) return p;
        n += 1;
        return { ...p, index: rec.index, ngapId: rec.ngapId ?? p.ngapId };
      });
      return { ...state, players, importedCount: state.importedCount + n };
    }
    case "generate": {
      const result = route(routingInput(state));
      return {
        ...state,
        draw: result.groups.map((g) => ({ ...g, locked: false })),
        drawWarnings: result.warnings,
        published: false,
      };
    }
    case "move": {
      if (!state.draw) return state;
      const target = state.draw.find((g) => g.number === a.toGroup);
      const source = state.draw.find((g) => g.playerIds.includes(a.playerId));
      if (!target || target.locked || source?.locked) return state;
      if (source?.number === target.number) return state;
      if (target.playerIds.length >= state.config.groupSize) return state;
      return {
        ...state,
        draw: state.draw.map((g) => {
          if (g.number === target.number) return { ...g, playerIds: [...g.playerIds, a.playerId] };
          if (g.number === source?.number) {
            return { ...g, playerIds: g.playerIds.filter((id) => id !== a.playerId) };
          }
          return g;
        }),
      };
    }
    case "lock":
      return {
        ...state,
        draw:
          state.draw?.map((g) => (g.number === a.group ? { ...g, locked: !g.locked } : g)) ?? null,
      };
    case "publish":
      return { ...state, published: a.value };
  }
}

const initial = (): DeskState => ({
  name: "IGCC Monthly Medal (demo)",
  config: DEMO_CONFIG,
  players: makeDemoPlayers(),
  draw: null,
  drawWarnings: [],
  published: false,
  importedCount: 0,
});

interface Desk {
  state: DeskState;
  registrations: Registration[];
  regById: Map<string, Registration>;
  unplaced: Registration[];
  playerById: Map<string, DeskPlayer>;
  names: {
    category: (id: string | null) => string;
    flight: (id: string | null) => string;
    tee: (id: string | null) => string;
  };
  dispatch: (a: Action) => void;
  classify: (p: DeskPlayer) => Registration;
}

const Ctx = createContext<Desk | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  const classify = useCallback(
    (p: DeskPlayer) => classifyPlayer(p, routingInput({ players: [], config: state.config })),
    [state.config],
  );

  const value = useMemo<Desk>(() => {
    const registrations = state.players.map(classify);
    const regById = new Map(registrations.map((r) => [r.playerId, r]));
    const inDraw = new Set(state.draw?.flatMap((g) => g.playerIds) ?? []);
    const unplaced = state.draw
      ? registrations.filter((r) => r.status === "ok" && !inDraw.has(r.playerId))
      : [];
    const lookup =
      <T extends { id: string; name: string }>(xs: T[]) =>
      (id: string | null) =>
        xs.find((x) => x.id === id)?.name ?? "—";
    return {
      state,
      registrations,
      regById,
      unplaced,
      playerById: new Map(state.players.map((p) => [p.id, p])),
      names: {
        category: lookup(DEMO_CATEGORIES),
        flight: lookup(DEMO_FLIGHTS),
        tee: lookup(DEMO_TEES),
      },
      dispatch,
      classify,
    };
  }, [state, classify]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesk(): Desk {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDesk must be used inside DeskProvider");
  return v;
}
