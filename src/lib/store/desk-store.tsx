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
import { type DrawGroup, dropCheck, validateDraw } from "@/lib/draw/validate";
import type { ImportRecord } from "@/lib/ngap";
import { classifyPlayer, type Registration, route, type TournamentConfig } from "@/lib/routing";

export type { DrawGroup };

/** What players see. A frozen copy, so organizer edits never leak out before they publish again. */
export interface PublishedGroup {
  number: number;
  startHole: number;
  wave: string | null;
  time: string;
  flight: string;
  players: string[];
}
export interface Published {
  at: string;
  /** Who is in which group at publish time; compared with the board to spot unpublished changes. */
  signature: string;
  groups: PublishedGroup[];
}

const signatureOf = (draw: DrawGroup[]) =>
  draw.map((g) => `${g.number}:${g.playerIds.join(",")}`).join("|");

interface DeskState {
  name: string;
  config: TournamentConfig;
  players: DeskPlayer[];
  draw: DrawGroup[] | null;
  drawWarnings: string[];
  published: Published | null;
  importedCount: number;
}

type Action =
  | { type: "addPlayer"; player: DeskPlayer }
  | { type: "removePlayer"; id: string }
  | { type: "updatePlayer"; id: string; patch: Partial<DeskPlayer> }
  | { type: "setConfig"; config: Partial<TournamentConfig> }
  | { type: "applyImport"; records: ImportRecord[] }
  | { type: "generate" }
  | { type: "move"; playerId: string; toGroup: number }
  | { type: "lock"; group: number }
  | { type: "publish" }
  | { type: "unpublish" };

const routingInput = (s: Pick<DeskState, "players" | "config">) => ({
  players: s.players,
  config: s.config,
  tees: DEMO_TEES,
  categories: DEMO_CATEGORIES,
  flights: DEMO_FLIGHTS,
});

/** Freezes the board into what players will see. Empty groups are left off the sheet. */
export function buildPublished(draw: DrawGroup[], players: DeskPlayer[]): Published {
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  return {
    at: new Date().toISOString(),
    signature: signatureOf(draw),
    groups: draw
      .filter((g) => g.playerIds.length > 0)
      .map((g) => ({
        number: g.number,
        startHole: g.startHole,
        wave: g.wave,
        time: g.time,
        flight: nameLookup(DEMO_FLIGHTS)(g.flightId),
        players: g.playerIds.map((id) => nameById.get(id) ?? ""),
      })),
  };
}

const nameLookup =
  <T extends { id: string; name: string }>(xs: T[]) =>
  (id: string | null) =>
    xs.find((x) => x.id === id)?.name ?? "—";
const NAMES = { flight: nameLookup(DEMO_FLIGHTS), category: nameLookup(DEMO_CATEGORIES) };

const registrationsOf = (s: Pick<DeskState, "players" | "config">) =>
  s.players.map((p) => classifyPlayer(p, routingInput({ players: [], config: s.config })));

function reducer(state: DeskState, a: Action): DeskState {
  switch (a.type) {
    case "addPlayer":
      return { ...state, players: [...state.players, a.player] };
    case "updatePlayer":
      return {
        ...state,
        players: state.players.map((p) => (p.id === a.id ? { ...p, ...a.patch, id: p.id } : p)),
      };
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
        // Small groups are checked live by validateDraw, so the engine's one-off copy would go stale
        // the moment the organizer fixes it.
        drawWarnings: result.warnings.filter((w) => !/a group has only/.test(w)),
        published: null,
      };
    }
    case "move": {
      if (!state.draw) return state;
      const regs = new Map(registrationsOf(state).map((r) => [r.playerId, r]));
      const check = dropCheck(state.draw, state.config, regs, a.playerId, a.toGroup, NAMES);
      if (!check.ok) return state;
      return {
        ...state,
        draw: state.draw.map((g) => {
          if (g.number === a.toGroup) return { ...g, playerIds: [...g.playerIds, a.playerId] };
          if (g.playerIds.includes(a.playerId)) {
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
    case "publish": {
      if (!state.draw) return state;
      const issues = validateDraw({
        draw: state.draw,
        registrations: registrationsOf(state),
        config: state.config,
        engineWarnings: state.drawWarnings,
        names: NAMES,
      });
      // The page disables the button too; this is the backstop.
      if (issues.some((i) => i.severity === "blocking")) return state;
      return { ...state, published: buildPublished(state.draw, state.players) };
    }
    case "unpublish":
      return { ...state, published: null };
  }
}

const initial = (): DeskState => ({
  name: "IGCC Monthly Medal (demo)",
  config: DEMO_CONFIG,
  players: makeDemoPlayers(),
  draw: null,
  drawWarnings: [],
  published: null,
  importedCount: 0,
});

interface Desk {
  state: DeskState;
  registrations: Registration[];
  regById: Map<string, Registration>;
  unplaced: Registration[];
  /** True once pairings are out; `changedSincePublish` means the board no longer matches them. */
  isPublished: boolean;
  changedSincePublish: boolean;
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
    const lookup = nameLookup;
    return {
      state,
      registrations,
      regById,
      unplaced,
      isPublished: state.published !== null,
      changedSincePublish:
        state.published !== null &&
        state.draw !== null &&
        state.published.signature !== signatureOf(state.draw),
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
