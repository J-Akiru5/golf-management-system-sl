"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DeskMember } from "@/lib/auth/member";
import { loadDesk } from "@/lib/data/supabase/load-desk";
import { type PersistResult, persistDeskAction } from "@/lib/data/supabase/persist";
import { loadPublicPairings } from "@/lib/data/supabase/public-pairings";
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
import {
  type CategoryRule,
  classifyPlayer,
  type FlightRule,
  type Registration,
  route,
  type Tee,
  type TournamentConfig,
} from "@/lib/routing";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

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
  /** Assigned by the database on publish (1, 2, 3...). */
  version?: number;
  /** Tournament metadata is frozen with the pairing rows so later setup edits stay private. */
  eventName?: string;
  date?: string;
  startFormat?: TournamentConfig["startFormat"];
  firstTeeTime?: string;
}

const signatureOf = (draw: DrawGroup[]) =>
  draw.map((group) => `${group.number}:${group.playerIds.join(",")}`).join("|");

export interface DeskState {
  name: string;
  config: TournamentConfig;
  players: DeskPlayer[];
  draw: DrawGroup[] | null;
  drawWarnings: string[];
  published: Published | null;
  importedCount: number;
  /** Persistence metadata is internal to the provider; UI fields above retain their old meaning. */
  clubId: string | null;
  tournamentId: string | null;
  cutoffDate: string | null;
  tees: Tee[];
  categories: CategoryRule[];
  flights: FlightRule[];
  holes: { number: number; par: number; strokeIndex: number }[];
  photoPaths: Record<string, string | null>;
}

export type Action =
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

export interface Desk {
  state: DeskState;
  registrations: Registration[];
  regById: Map<string, Registration>;
  unplaced: Registration[];
  isPublished: boolean;
  changedSincePublish: boolean;
  playerById: Map<string, DeskPlayer>;
  names: {
    category: (id: string | null) => string;
    flight: (id: string | null) => string;
    tee: (id: string | null) => string;
  };
  dispatch: (action: Action) => void;
  classify: (player: DeskPlayer) => Registration;
  status?: "loading" | "ready" | "error";
  error?: string | null;
  member?: { displayName: string; role: "owner" | "organizer" | "desk" } | null;
  lastSavedAt?: string | null;
  saving?: boolean;
}

const routingInput = (state: DeskState) => ({
  players: state.players,
  config: state.config,
  tees: state.tees,
  categories: state.categories,
  flights: state.flights,
});

export function buildPublished(
  draw: DrawGroup[],
  players: DeskPlayer[],
  flights: FlightRule[] = DEMO_FLIGHTS,
  event?: { name: string; config: TournamentConfig },
): Published {
  const nameById = new Map(players.map((player) => [player.id, player.name]));
  const flightNameById = new Map(flights.map((flight) => [flight.id, flight.name]));
  return {
    at: new Date().toISOString(),
    signature: signatureOf(draw),
    ...(event
      ? {
          eventName: event.name,
          date: event.config.date,
          startFormat: event.config.startFormat,
          firstTeeTime: event.config.firstTeeTime,
        }
      : {}),
    groups: draw
      .filter((group) => group.playerIds.length > 0)
      .map((group) => ({
        number: group.number,
        startHole: group.startHole,
        wave: group.wave,
        time: group.time,
        flight: flightNameById.get(group.flightId) ?? "—",
        players: group.playerIds.map((id) => nameById.get(id) ?? ""),
      })),
  };
}

const nameLookup =
  <T extends { id: string; name: string }>(items: T[]) =>
  (id: string | null) =>
    items.find((item) => item.id === id)?.name ?? "—";

function createEmptyDeskState(): DeskState {
  return {
    name: "",
    config: {
      date: "",
      maxIndex: 30,
      allowance: 1,
      flightBasis: "index",
      startFormat: "shotgun",
      holes: 18,
      groupSize: 4,
      minGroupSize: 3,
      firstTeeTime: "07:00",
      intervalMinutes: 12,
      waveGapMinutes: 300,
    },
    players: [],
    draw: null,
    drawWarnings: [],
    published: null,
    importedCount: 0,
    clubId: null,
    tournamentId: null,
    cutoffDate: null,
    tees: [],
    categories: [],
    flights: [],
    holes: [],
    photoPaths: {},
  };
}

export function createDemoDeskState(): DeskState {
  return {
    name: "IGCC Monthly Medal (demo)",
    config: DEMO_CONFIG,
    players: makeDemoPlayers(),
    draw: null,
    drawWarnings: [],
    published: null,
    importedCount: 0,
    clubId: null,
    tournamentId: null,
    cutoffDate: DEMO_CONFIG.date,
    tees: DEMO_TEES,
    categories: DEMO_CATEGORIES,
    flights: DEMO_FLIGHTS,
    holes: [],
    photoPaths: {},
  };
}

export function createInitialDeskState(supabaseEnabled: boolean): DeskState {
  return supabaseEnabled ? createEmptyDeskState() : createDemoDeskState();
}

function stateFromLoadedDesk(loaded: Awaited<ReturnType<typeof loadDesk>>): DeskState {
  return {
    name: loaded.name,
    config: loaded.config,
    players: loaded.players,
    draw: loaded.draw,
    drawWarnings: loaded.drawWarnings,
    published: loaded.published,
    importedCount: loaded.importedCount,
    clubId: loaded.clubId,
    tournamentId: loaded.tournamentId,
    cutoffDate: loaded.cutoffDate,
    tees: loaded.tees,
    categories: loaded.categories,
    flights: loaded.flights,
    holes: loaded.holes,
    photoPaths: loaded.photoPaths,
  };
}

function stateFromPublicPairings(
  pairings: Awaited<ReturnType<typeof loadPublicPairings>>,
): DeskState {
  const state = createEmptyDeskState();
  if (!pairings) return state;
  return {
    ...state,
    name: pairings.name,
    config: {
      ...state.config,
      date: pairings.date,
      startFormat: pairings.startFormat,
      firstTeeTime: pairings.firstTeeTime,
    },
    published: pairings.published,
  };
}

function reducer(state: DeskState, action: Action): DeskState {
  switch (action.type) {
    case "addPlayer":
      return { ...state, players: [...state.players, action.player] };
    case "updatePlayer":
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.id ? { ...player, ...action.patch, id: player.id } : player,
        ),
      };
    case "removePlayer": {
      const photoPaths = { ...state.photoPaths };
      delete photoPaths[action.id];
      return {
        ...state,
        players: state.players.filter((player) => player.id !== action.id),
        draw:
          state.draw?.map((group) => ({
            ...group,
            playerIds: group.playerIds.filter((id) => id !== action.id),
          })) ?? null,
        photoPaths,
      };
    }
    case "setConfig":
      return { ...state, config: { ...state.config, ...action.config } };
    case "applyImport": {
      const byId = new Map(
        action.records
          .filter((record) => record.playerId)
          .map((record) => [record.playerId, record]),
      );
      let count = 0;
      const players = state.players.map((player) => {
        const record = byId.get(player.id);
        if (!record) return player;
        count += 1;
        const effectiveForEvent = !state.cutoffDate || record.effectiveDate <= state.cutoffDate;
        return {
          ...player,
          index: effectiveForEvent ? record.index : player.index,
          ngapId: record.ngapId ?? player.ngapId,
        };
      });
      return { ...state, players, importedCount: state.importedCount + count };
    }
    case "generate": {
      const result = route(routingInput(state));
      return {
        ...state,
        draw: result.groups.map((group) => ({ ...group, locked: false })),
        drawWarnings: result.warnings.filter((warning) => !/a group has only/.test(warning)),
        published: null,
      };
    }
    case "move": {
      if (!state.draw) return state;
      const registrations = new Map(
        state.players
          .map((player) => classifyPlayer(player, routingInput(state)))
          .map((registration) => [registration.playerId, registration]),
      );
      const names = { flight: nameLookup(state.flights), category: nameLookup(state.categories) };
      const check = dropCheck(
        state.draw,
        state.config,
        registrations,
        action.playerId,
        action.toGroup,
        names,
      );
      if (!check.ok) return state;
      return {
        ...state,
        draw: state.draw.map((group) => {
          if (group.number === action.toGroup) {
            return { ...group, playerIds: [...group.playerIds, action.playerId] };
          }
          if (group.playerIds.includes(action.playerId)) {
            return { ...group, playerIds: group.playerIds.filter((id) => id !== action.playerId) };
          }
          return group;
        }),
      };
    }
    case "lock":
      return {
        ...state,
        draw:
          state.draw?.map((group) =>
            group.number === action.group ? { ...group, locked: !group.locked } : group,
          ) ?? null,
      };
    case "publish": {
      if (!state.draw) return state;
      const registrations = state.players.map((player) =>
        classifyPlayer(player, routingInput(state)),
      );
      const issues = validateDraw({
        draw: state.draw,
        registrations,
        config: state.config,
        engineWarnings: state.drawWarnings,
        names: { flight: nameLookup(state.flights), category: nameLookup(state.categories) },
      });
      if (issues.some((issue) => issue.severity === "blocking")) return state;
      return {
        ...state,
        published: buildPublished(state.draw, state.players, state.flights, {
          name: state.name,
          config: state.config,
        }),
      };
    }
    case "unpublish":
      return { ...state, published: null };
  }
}

interface PendingWrite {
  action: Action;
  before: DeskState;
  after: DeskState;
}

function applyPersistResult(state: DeskState, result: PersistResult): DeskState {
  const photoPaths = result.photoPathUpdates
    ? { ...state.photoPaths, ...result.photoPathUpdates }
    : state.photoPaths;
  if (!result.photoUrlUpdates && !result.consentUpdates && !result.indexUpdates) {
    return { ...state, photoPaths };
  }
  return {
    ...state,
    photoPaths,
    players: state.players.map((player) => {
      const hasPhotoUpdate = result.photoUrlUpdates
        ? Object.hasOwn(result.photoUrlUpdates, player.id)
        : false;
      const hasConsentUpdate = result.consentUpdates
        ? Object.hasOwn(result.consentUpdates, player.id)
        : false;
      const hasIndexUpdate = result.indexUpdates
        ? Object.hasOwn(result.indexUpdates, player.id)
        : false;
      if (!hasPhotoUpdate && !hasConsentUpdate && !hasIndexUpdate) return player;
      return {
        ...player,
        ...(hasPhotoUpdate ? { photo: result.photoUrlUpdates?.[player.id] } : {}),
        ...(hasConsentUpdate ? { photoConsent: result.consentUpdates?.[player.id] } : {}),
        ...(hasIndexUpdate ? { index: result.indexUpdates?.[player.id] ?? null } : {}),
      };
    }),
  };
}

const Ctx = createContext<Desk | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pageMode =
    pathname === "/pairings"
      ? "public"
      : pathname === "/login" || pathname.startsWith("/auth/")
        ? "auth"
        : "desk";
  const supabaseEnabled = isSupabaseConfigured();
  const [state, setState] = useState<DeskState>(() => createInitialDeskState(supabaseEnabled));
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    supabaseEnabled ? "loading" : "ready",
  );
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<DeskMember | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stateRef = useRef(state);
  const statusRef = useRef(status);
  const clientRef = useRef<SupabaseClient<Database> | null>(null);
  const writesRef = useRef<PendingWrite[]>([]);
  const writingRef = useRef(false);
  const publicPathRef = useRef(pageMode === "public");

  const replaceState = useCallback((next: DeskState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const changeStatus = useCallback((next: "loading" | "ready" | "error") => {
    statusRef.current = next;
    setStatus(next);
  }, []);
  const getClient = useCallback(() => {
    if (!clientRef.current) clientRef.current = createSupabaseBrowserClient();
    return clientRef.current;
  }, []);

  useEffect(() => {
    if (!supabaseEnabled) {
      changeStatus("ready");
      return;
    }

    let active = true;
    let unsubscribe: () => void = () => {};
    const publicPage = pageMode === "public";
    publicPathRef.current = publicPage;
    replaceState(createEmptyDeskState());
    setError(null);
    setMember(null);
    setLastSavedAt(null);
    changeStatus("loading");

    if (pageMode === "auth") {
      changeStatus("ready");
      return () => {
        active = false;
      };
    }

    async function load() {
      try {
        const client = getClient();
        const { data: authListener } = client.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT" && pageMode === "desk" && active) {
            replaceState(createEmptyDeskState());
            setMember(null);
            setLastSavedAt(null);
            setError(null);
            changeStatus("ready");
          }
        });
        unsubscribe = () => authListener.subscription.unsubscribe();
        if (publicPage) {
          const publicPairings = await loadPublicPairings(client);
          if (!active) return;
          if (!publicPairings) {
            changeStatus("error");
            setError("No tournament is available for public pairings.");
            return;
          }
          replaceState(stateFromPublicPairings(publicPairings));
          changeStatus("ready");
          return;
        }

        const loaded = await loadDesk(client);
        if (!active) return;
        replaceState(stateFromLoadedDesk(loaded));
        setMember(loaded.member);
        changeStatus("ready");
      } catch (loadError) {
        if (!active) return;
        changeStatus("error");
        setError(
          loadError instanceof Error ? loadError.message : "Could not load the tournament desk.",
        );
      }
    }

    void load();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [changeStatus, getClient, pageMode, replaceState, supabaseEnabled]);

  const processWrites = useCallback(async () => {
    if (writingRef.current) return;
    writingRef.current = true;
    setSaving(true);
    try {
      while (writesRef.current.length) {
        const pending = writesRef.current.shift();
        if (!pending) continue;
        try {
          const result = await persistDeskAction(
            getClient(),
            pending.action,
            pending.before,
            pending.after,
          );
          if (!publicPathRef.current) replaceState(applyPersistResult(stateRef.current, result));
          setLastSavedAt(new Date().toISOString());
          setError(null);
        } catch (writeError) {
          writesRef.current = [];
          const message =
            writeError instanceof Error ? writeError.message : "Could not save the change.";
          setError(message);
          if (!publicPathRef.current) {
            try {
              const refreshed = await loadDesk(getClient());
              replaceState(stateFromLoadedDesk(refreshed));
              setMember(refreshed.member);
              changeStatus("ready");
            } catch (refreshError) {
              changeStatus("error");
              setError(
                refreshError instanceof Error
                  ? `${message} Refresh failed: ${refreshError.message}`
                  : message,
              );
            }
          }
          break;
        }
      }
    } finally {
      writingRef.current = false;
      setSaving(false);
    }
  }, [changeStatus, getClient, replaceState]);

  const dispatch = useCallback(
    (action: Action) => {
      if (supabaseEnabled && statusRef.current !== "ready") return;
      let resolvedAction = action;
      if (supabaseEnabled && action.type === "addPlayer") {
        resolvedAction = {
          ...action,
          player: { ...action.player, id: crypto.randomUUID() },
        };
      }

      const before = stateRef.current;
      const after = reducer(before, resolvedAction);
      if (after === before) return;
      replaceState(after);

      if (!supabaseEnabled) return;
      if (!after.clubId || !after.tournamentId) {
        setError("No active club tournament is loaded; the change was not saved.");
        return;
      }
      writesRef.current.push({ action: resolvedAction, before, after });
      setError(null);
      void processWrites();
    },
    [processWrites, replaceState, supabaseEnabled],
  );

  const classify = useCallback(
    (player: DeskPlayer) => classifyPlayer(player, routingInput(state)),
    [state],
  );

  const value = useMemo<Desk>(() => {
    const registrations = state.players.map(classify);
    const regById = new Map(
      registrations.map((registration) => [registration.playerId, registration]),
    );
    const inDraw = new Set(state.draw?.flatMap((group) => group.playerIds) ?? []);
    const unplaced = state.draw
      ? registrations.filter(
          (registration) => registration.status === "ok" && !inDraw.has(registration.playerId),
        )
      : [];
    return {
      state,
      registrations,
      regById,
      unplaced,
      isPublished: state.published !== null,
      changedSincePublish:
        state.published !== null &&
        state.draw !== null &&
        (state.published.signature !== signatureOf(state.draw) ||
          state.published.eventName !== state.name ||
          state.published.date !== state.config.date ||
          state.published.startFormat !== state.config.startFormat ||
          state.published.firstTeeTime !== state.config.firstTeeTime),
      playerById: new Map(state.players.map((player) => [player.id, player])),
      names: {
        category: nameLookup(state.categories),
        flight: nameLookup(state.flights),
        tee: nameLookup(state.tees),
      },
      dispatch,
      classify,
      status,
      error,
      member,
      lastSavedAt,
      saving,
    };
  }, [state, classify, dispatch, status, error, member, lastSavedAt, saving]);

  const content = !supabaseEnabled ? (
    children
  ) : status === "loading" ? (
    <main role="status" aria-live="polite">
      Loading tournament data…
    </main>
  ) : status === "error" ? (
    <main role="alert">
      <h1>Could not load the tournament desk</h1>
      <p>{error ?? "Check the Supabase connection and club setup, then try again."}</p>
    </main>
  ) : (
    <>
      {error && <p role="alert">{error}</p>}
      {children}
    </>
  );

  return <Ctx.Provider value={value}>{content}</Ctx.Provider>;
}

export function useDesk(): Desk {
  const value = useContext(Ctx);
  if (!value) throw new Error("useDesk must be used inside DeskProvider");
  return value;
}
