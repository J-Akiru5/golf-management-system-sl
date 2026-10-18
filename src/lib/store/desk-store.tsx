"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Adapters, createMockAdapters } from "@/lib/data/adapters";
import { getDeskMember } from "@/lib/auth/member";
import { loadDeskState } from "@/lib/data/supabase/load-desk-state";
import { createSupabaseAdapters } from "@/lib/data/supabase/adapters";
import { registrationFor } from "@/lib/data/registrations";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";
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
  /** "demo" when no Supabase URL is configured; otherwise the load state of the real desk. */
  status: "demo" | "loading" | "ready" | "error";
  /** Set when a Supabase read or write failed. Never swallowed. */
  error: string | null;
  /** True while a write is in flight, for a "saving…" label. */
  saving: boolean;
}

const Ctx = createContext<Desk | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const connected = isSupabaseConfigured();
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);
  const [status, setStatus] = useState<Desk["status"]>(connected ? "loading" : "demo");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // One read on load. Without a Supabase URL the desk stays on the in-memory demo, unchanged.
  useEffect(() => {
    if (!connected) {
      setStatus("demo");
      return;
    }
    let active = true;
    setStatus("loading");
    setError(null);
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data.user) throw new Error("Sign in to load the tournament desk.");
        const member = await getDeskMember(supabase, data.user.id);
        const loaded = await loadDeskState(supabase, member.clubId);
        if (!active) return;
        setClient(supabase);
        dispatch({ type: "hydrate", state: loaded.state });
        setStatus("ready");
      } catch (loadError) {
        if (!active) return;
        setStatus("error");
        setError(loadError instanceof Error ? loadError.message : "Could not load the desk.");
      }
    })();
    return () => {
      active = false;
    };
  }, [connected]);

  const adapters = useMemo<Adapters>(() => {
    if (!connected || !client) return createMockAdapters(state, dispatch);
    return createSupabaseAdapters(state, dispatch, {
      client,
      clubId: state.clubId,
      onError: setError,
      onSaved: () => setError(null),
      onBusy: setSaving,
    });
  }, [state, connected, client]);

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
      adapters,
      dispatch,
      classifyDraft,
      status,
      error,
      saving,
    };
  }, [state, adapters, status, error, saving]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesk(): Desk {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDesk must be used inside DeskProvider");
  return v;
}
