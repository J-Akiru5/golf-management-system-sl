"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { type Adapters, createMockAdapters } from "@/lib/data/adapters";
import { registrationFor } from "@/lib/data/registrations";
import type {
  Club,
  DeferredMatch,
  DeskRegistration,
  Hole,
  ManualOverride,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "@/lib/data/types";
import { DEMO_CLUB, DEMO_HOLES, DEMO_TEES } from "@/lib/demo/data";
import type { DrawGroup } from "@/lib/draw/validate";
import type { Tee } from "@/lib/routing";
import {
  type Action,
  buildRegistrations,
  type DeskState,
  flagsOf,
  type Published,
} from "@/lib/store/state";
import { activeTournament, boardOf, entriesFor, initialState, reducer } from "./state";

export type { Action, ApplyImportPayload, BoardState, DeskState, Published } from "./state";
export { buildPublished } from "./state";
export type { DrawGroup };

interface DraftPlayer {
  name: string;
  birthdate: string | null;
  gender: "M" | "F" | null;
  index: number | null;
}

interface Desk {
  state: DeskState;
  club: Club;
  tournaments: Tournament[];
  /** The event the desk is working on. Null shows the no-tournament state. */
  tournament: Tournament | null;
  tees: Tee[];
  holes: Hole[];
  /** Every player in the club directory. */
  players: PlayerRecord[];
  playerById: Map<string, PlayerRecord>;
  /** Registrations in the active tournament. */
  entries: RegistrationEntry[];
  registrations: DeskRegistration[];
  regById: Map<string, DeskRegistration>;
  entryByPlayer: Map<string, RegistrationEntry>;
  /** Ready players who are not in a group yet. */
  unplaced: DeskRegistration[];
  draw: DrawGroup[] | null;
  warnings: string[];
  published: Published | null;
  overrides: ManualOverride[];
  isPublished: boolean;
  changedSincePublish: boolean;
  names: {
    category: (id: string | null) => string;
    flight: (id: string | null) => string;
    tee: (id: string | null) => string;
  };
  deferred: DeferredMatch[];
  /** Registrations whose frozen index no longer matches the records. */
  pendingRefreeze: DeskRegistration[];
  flags: { playerId: string; message: string }[];
  adapters: Adapters;
  dispatch: Dispatch<Action>;
  /** Preview used by the add-player form: where a draft player would land. */
  classifyDraft: (draft: DraftPlayer) => DeskRegistration | null;
}

const Ctx = createContext<Desk | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const value = useMemo<Desk>(() => {
    const tournament = activeTournament(state);
    const board = boardOf(state);
    const registrations = buildRegistrations(state);
    const entries = tournament ? entriesFor(state, tournament.id) : [];
    const draw = board.draw;
    const signature = draw?.map((g) => `${g.number}:${g.playerIds.join(",")}`).join("|") ?? "";
    const inDraw = new Set(draw?.flatMap((g) => g.playerIds) ?? []);
    const lookup =
      <T extends { id: string; name: string }>(xs: T[]) =>
      (id: string | null) =>
        xs.find((x) => x.id === id)?.name ?? "—";

    const classifyDraft = (draft: DraftPlayer): DeskRegistration | null => {
      if (!tournament) return null;
      const player: PlayerRecord = {
        id: "draft",
        clubId: state.clubId,
        firstName: draft.name.split(" ")[0] ?? draft.name,
        lastName: draft.name.split(" ").slice(1).join(" "),
        nickname: null,
        name: draft.name,
        birthdate: draft.birthdate,
        gender: draft.gender,
        homeCourse: null,
        contactNumber: null,
        email: null,
        ngapId: null,
        createdAt: "",
      };
      const entry: RegistrationEntry = {
        id: "draft",
        clubId: state.clubId,
        tournamentId: tournament.id,
        playerId: "draft",
        role: "member",
        sponsor: null,
        shirt: null,
        teePreferences: {},
        declaredWshId: null,
        declaredWshHandicap: null,
        extra: {},
        paymentStatus: "not_recorded",
        frozen: {
          index: draft.index,
          recordId: null,
          effectiveDate: null,
          frozenAt: "",
        },
        createdAt: "",
        source: "desk",
      };
      return registrationFor({ tournament, tees: DEMO_TEES, player, entry, records: [] });
    };

    return {
      state,
      club: DEMO_CLUB,
      tournaments: state.tournaments,
      tournament,
      tees: DEMO_TEES,
      holes: DEMO_HOLES,
      players: state.players,
      playerById: new Map(state.players.map((p) => [p.id, p])),
      entries,
      registrations,
      regById: new Map(registrations.map((r) => [r.playerId, r])),
      entryByPlayer: new Map(entries.map((e) => [e.playerId, e])),
      unplaced: draw
        ? registrations.filter((r) => r.status === "ok" && !inDraw.has(r.playerId))
        : [],
      draw,
      warnings: board.warnings,
      published: board.published,
      overrides: board.overrides,
      isPublished: board.published !== null,
      changedSincePublish:
        board.published !== null && draw !== null && board.published.signature !== signature,
      names: {
        category: lookup(tournament?.categories ?? []),
        flight: lookup(tournament?.flights ?? []),
        tee: lookup(DEMO_TEES),
      },
      deferred: state.deferred,
      pendingRefreeze: registrations.filter((r) => r.frozenOutdated),
      flags: flagsOf(registrations),
      adapters: createMockAdapters(state, dispatch),
      dispatch,
      classifyDraft,
    };
  }, [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesk(): Desk {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDesk must be used inside DeskProvider");
  return v;
}
