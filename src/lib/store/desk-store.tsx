"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { getDeskMember } from "@/lib/auth/member";
import { type Adapters, createMockAdapters } from "@/lib/data/adapters";
import { registrationFor } from "@/lib/data/registrations";
import { createQueue, createSupabaseAdapters } from "@/lib/data/supabase/adapters";
import {
  publishPairings,
  refreshPublicPage,
  saveDraw,
  unpublishPairings,
} from "@/lib/data/supabase/draw-sync";
import { loadDeskState } from "@/lib/data/supabase/load-desk-state";
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
import { NO_DESK_SNAPSHOT_NOTICE, OFFLINE_WRITE_NOTICE, toDeskSnapshot } from "@/lib/offline/cache";
import { lastDeskUserId, loadDeskSnapshot, saveDeskSnapshot } from "@/lib/offline/store";
import type { Tee } from "@/lib/routing";
import {
  type Action,
  buildRegistrations,
  type DeskState,
  flagsOf,
  type Published,
} from "@/lib/store/state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";
import { type DrawJob, planDrawJobs } from "./draw-persist";
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
  /**
   * Who is signed in, for the session bar. `undefined` means this build has no auth at all (demo);
   * `null` means signed in without a club membership row.
   */
  member?: { displayName: string; role: "owner" | "organizer" | "desk" } | null;
  /** ISO timestamp of the last successful write. */
  lastSavedAt?: string | null;
  /** True when the phone has no connection, or the desk is showing a saved copy. */
  offline: boolean;
  /** ISO time the saved copy was written, or null when the desk read from the network. */
  cachedAt: string | null;
  /** Re-runs the load after a failure, for the retry control. */
  reload: () => void;
}

const Ctx = createContext<Desk | null>(null);

/** Actions that change the draw or what is published; with Supabase these are written to it. */
const DRAW_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "generate",
  "move",
  "setGroupLocked",
  "publish",
  "unpublish",
]);

/**
 * Actions that only move around what is already on screen. Every other action changes data, and
 * is refused while the phone is offline rather than saved into a queue that would run later.
 */
const LOCAL_ONLY_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "hydrate",
  "selectTournament",
  "publishAck",
]);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState);
  // The newest state, including actions dispatched since the last render, so two quick edits
  // compare against each other and not against a stale snapshot.
  const latest = useRef(state);
  latest.current = state;
  // Each tournament's draw revision as the database last confirmed it.
  const revisions = useRef<Record<string, number>>({});
  const connected = isSupabaseConfigured();
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);
  const [status, setStatus] = useState<Desk["status"]>(connected ? "loading" : "demo");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [member, setMember] = useState<Desk["member"]>(connected ? undefined : undefined);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [networkOnline, setNetworkOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  // The queue and the dispatcher were created once; they read the current truth through this ref.
  // Writes are allowed only on a live, loaded desk: not while loading, not on a failed load, and
  // not on a saved copy.
  const canWriteRef = useRef(!connected);
  canWriteRef.current = !connected || (status === "ready" && networkOnline && cachedAt === null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sync = () => setNetworkOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // One read on load. Without a Supabase URL the desk stays on the in-memory demo, unchanged.
  useEffect(() => {
    if (!connected) {
      setStatus("demo");
      setMember(undefined);
      return;
    }
    let active = true;
    setStatus("loading");
    setError(null);
    setCachedAt(null);
    void (async () => {
      let userId: string | null = null;
      try {
        const supabase = createSupabaseBrowserClient();
        setClient(supabase);
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data.user) throw new Error("Sign in to load the tournament desk.");
        userId = data.user.id;
        userIdRef.current = userId;
        const signedIn = await getDeskMember(supabase, userId);
        const loaded = await loadDeskState(supabase, signedIn.clubId);
        if (!active) return;
        setMember({ displayName: signedIn.displayName, role: signedIn.role });
        revisions.current = loaded.revisions;
        rawDispatch({ type: "hydrate", state: loaded.state });
        setStatus("ready");
        setCachedAt(null);
        void saveDeskSnapshot(
          userId,
          signedIn.clubId,
          toDeskSnapshot(loaded, {
            displayName: signedIn.displayName,
            role: signedIn.role,
          }),
        );
      } catch (loadError) {
        if (!active) return;
        // The network, the session or the project can be unavailable. A current saved copy is
        // better than an empty screen, as long as every screen says it is a saved copy.
        const fallbackId = userId ?? userIdRef.current ?? lastDeskUserId();
        const snapshot = fallbackId ? await loadDeskSnapshot(fallbackId) : null;
        if (!active) return;
        if (snapshot) {
          setMember(snapshot.payload.member);
          revisions.current = snapshot.payload.revisions;
          rawDispatch({ type: "hydrate", state: snapshot.payload.state });
          setStatus("ready");
          setCachedAt(snapshot.savedAt);
          setError(null);
        } else {
          setStatus("error");
          setError(
            typeof navigator !== "undefined" && navigator.onLine === false
              ? NO_DESK_SNAPSHOT_NOTICE
              : loadError instanceof Error
                ? loadError.message
                : "Could not load the desk.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [connected, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // One queue for every draw write, so saves and publishes reach the database in the order the
  // organizer made them.
  const drawQueue = useRef<ReturnType<typeof createQueue> | null>(null);
  if (!drawQueue.current) {
    drawQueue.current = createQueue({
      onError: setError,
      onSaved: () => {
        setError(null);
        setLastSavedAt(new Date().toISOString());
      },
      onBusy: setSaving,
      canWrite: () => canWriteRef.current,
    });
  }

  const runDrawJob = useCallback(async (job: DrawJob, supabase: SupabaseClient<Database>) => {
    const revision = revisions.current[job.tournamentId] ?? 0;
    if (job.kind === "save") {
      revisions.current[job.tournamentId] = await saveDraw(
        supabase,
        job.tournamentId,
        revision,
        job.draw,
        job.overrides,
      );
      return;
    }
    if (job.kind === "publish") {
      const result = await publishPairings(supabase, job.tournamentId, revision, job.published);
      rawDispatch({
        type: "publishAck",
        tournamentId: job.tournamentId,
        version: result.version,
        at: result.at,
      });
    } else {
      await unpublishPairings(supabase, job.tournamentId);
    }
    await refreshPublicPage(supabase);
  }, []);

  // Every screen dispatches through this. In demo mode it is the plain reducer; with Supabase the
  // draw actions are also queued for the database.
  const dispatch = useCallback<Dispatch<Action>>(
    (action) => {
      // Offline is not a queue: the change is refused before it reaches the reducer, so the screen
      // cannot show a value that the database never received.
      if (connected && !LOCAL_ONLY_ACTIONS.has(action.type) && !canWriteRef.current) {
        setError(OFFLINE_WRITE_NOTICE);
        return;
      }
      if (!client || !DRAW_ACTIONS.has(action.type)) {
        rawDispatch(action);
        return;
      }
      const before = latest.current;
      const after = reducer(before, action);
      latest.current = after;
      rawDispatch(action);
      for (const job of planDrawJobs(action, before, after)) {
        drawQueue.current?.(() => runDrawJob(job, client));
      }
    },
    [client, connected, runDrawJob],
  );

  const adapters = useMemo<Adapters>(() => {
    if (!connected || !client) return createMockAdapters(state, dispatch);
    return createSupabaseAdapters(state, dispatch, {
      client,
      clubId: state.clubId,
      canWrite: () => canWriteRef.current,
      onError: setError,
      onSaved: () => {
        setError(null);
        setLastSavedAt(new Date().toISOString());
      },
      onBusy: setSaving,
    });
  }, [state, connected, client, dispatch]);

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
      member: connected ? member : undefined,
      lastSavedAt,
      offline: connected && (!networkOnline || cachedAt !== null),
      cachedAt,
      reload,
    };
  }, [
    state,
    adapters,
    dispatch,
    status,
    error,
    saving,
    member,
    connected,
    lastSavedAt,
    networkOnline,
    cachedAt,
    reload,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesk(): Desk {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDesk must be used inside DeskProvider");
  return v;
}
