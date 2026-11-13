"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
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
import { useToast } from "@/components/ui/toast";
import type { DeskAccessProblem } from "@/lib/auth/access-problem";
import { DeskAccessError, getDeskMember } from "@/lib/auth/member";
import { type Adapters, createMockAdapters } from "@/lib/data/adapters";
import { daysOfTournament, selectedDaysOf } from "@/lib/data/dates";
import { registrationFor } from "@/lib/data/registrations";
import { createDemoScoringRepository, type ScoringRepository } from "@/lib/data/scoring";
import {
  createQueue,
  createSupabaseAdapters,
  type RevisionStore,
} from "@/lib/data/supabase/adapters";
import {
  type PublishResult,
  publishPairings,
  refreshPublicPage,
  saveDraw,
  unpublishPairings,
} from "@/lib/data/supabase/draw-sync";
import { loadDeskState } from "@/lib/data/supabase/load-desk-state";
import { createSupabaseScoringRepository } from "@/lib/data/supabase/scoring";
import type {
  Caddie,
  Club,
  DeferredMatch,
  DeskRegistration,
  Hole,
  ManualOverride,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
  TournamentDay,
} from "@/lib/data/types";
import { buildDemoScoringSeed } from "@/lib/demo/scoring";
import type { DrawGroup } from "@/lib/draw/validate";
import { displayName } from "@/lib/format";
import { NO_DESK_SNAPSHOT_NOTICE, OFFLINE_WRITE_NOTICE, toDeskSnapshot } from "@/lib/offline/cache";
import { lastDeskUserId, loadDeskSnapshot, saveDeskSnapshot } from "@/lib/offline/store";
import type { Tee } from "@/lib/routing";
import {
  type Action,
  type BoardState,
  buildRegistrations,
  type DeskState,
  drawSignatureForDay,
  flagsOf,
  type Published,
  playingDaysOfEvent,
  publishedSignatureForDay,
} from "@/lib/store/state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";
import { actionNotice } from "./action-notice";
import {
  type DayPreference,
  dayOnEventSwitch,
  dayToLoad,
  readDayPreference,
  writeDayPreference,
} from "./day-preference";
import { type DrawJob, planDrawJobs, publishedWhileWritesPending } from "./draw-persist";
import { activeTournament, boardOf, emptyState, entriesFor, initialState, reducer } from "./state";

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
  /** The active event's structured days. Empty when no event is selected. */
  days: TournamentDay[];
  /** Every player in the club directory. */
  players: PlayerRecord[];
  playerById: Map<string, PlayerRecord>;
  /** Registrations in the active tournament. */
  entries: RegistrationEntry[];
  /** Club caddie profiles. */
  caddies: Caddie[];
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
  /** Scorecard workflow. Connected when Supabase is configured, in-memory in the demo. */
  scoring: ScoringRepository;
  dispatch: Dispatch<Action>;
  /** Preview used by the add-player form: where a draft player would land. */
  classifyDraft: (draft: DraftPlayer) => DeskRegistration | null;
  /** "demo" when no Supabase URL is configured; otherwise the load state of the real desk. */
  status: "demo" | "loading" | "ready" | "error";
  /** Set when a Supabase read or write failed. Never swallowed. */
  error: string | null;
  /**
   * Set when the account cannot use a desk at all, which is a different thing from a read that
   * failed: the screens must not offer a retry for any of these.
   */
  accessProblem: DeskAccessProblem | null;
  /** True while a write is in flight, for a "saving…" label. */
  saving: boolean;
  /**
   * The last queued draw save failed and the board was put back to what the database holds.
   * Publishing is refused until a save succeeds.
   */
  saveFailed: boolean;
  /**
   * The publish and unpublish writes. The screens show the change only when this returns to
   * "idle"; "failed" carries the message so the dialog can keep itself open with a retry. The
   * provider never shows Published before the database confirms it.
   */
  publishState: "idle" | "working" | "failed";
  publishError: string | null;
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
  /** The playing day whose board is on screen. A draw save names that day's round. */
  drawDay: number | null;
  /** Shows another playing day's board, loaded and saved in place of this one. */
  setDrawDay: (day: number | null) => void;
}

const Ctx = createContext<Desk | null>(null);

/** Actions that change the draw or what is published; with Supabase these are written to it. */
const DRAW_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "generate",
  "replaceDraw",
  "move",
  "swapPlayers",
  "moveSet",
  "swapSets",
  "withdrawFromDraw",
  "restoreToDraw",
  "placeOnDraw",
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

/**
 * This browser's storage, or null in a server render and when the browser refuses it. Read through
 * a function so the provider can call it without ever touching `window` during render.
 */
function dayStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Storage switched off: the desk forgets the day between visits, and nothing else changes.
    return null;
  }
}

export function DeskProvider({ children }: { children: ReactNode }) {
  const connected = isSupabaseConfigured();
  // Every action reports what it did. One listener, so no screen has to invent its own wording.
  const toast = useToast();
  // A connected desk starts empty and fills from the database. It never starts from the demo, so
  // invented players and the sample event cannot show while loading or after a failed load.
  const [state, rawDispatch] = useReducer(
    reducer,
    undefined,
    connected ? emptyState : initialState,
  );
  // The newest state, including actions dispatched since the last render, so two quick edits
  // compare against each other and not against a stale snapshot.
  const latest = useRef(state);
  latest.current = state;
  // Each tournament's draw revision as the database last confirmed it. One counter for the whole
  // desk: `save_event_setup` and `save_draw` both bump it, so both read and write through here
  // rather than keeping a number each.
  const revisions = useRef<Record<string, number>>({});
  // An event to keep selected across the next load, for example one that was just created.
  const keepSelected = useRef<string | null>(null);
  // The playing day this browser last showed. It is read once, on the first load of a mount, so a
  // later reload or a remount cannot put an older day back over the organizer's own choice.
  const savedDay = useRef<DayPreference | null>(null);
  const savedDayRead = useRef(false);
  const restoreDayPreference = useCallback((): DayPreference | null => {
    if (!savedDayRead.current) {
      savedDayRead.current = true;
      savedDay.current = readDayPreference(dayStorage());
    }
    return savedDay.current;
  }, []);
  // Remembers the day on screen. Written against the event it was chosen on, so switching events can
  // tell whether that day applies there. A browser that refuses storage just forgets it.
  const rememberDay = useCallback((tournamentId: string, day: number | null) => {
    if (day === null) return;
    const storage = dayStorage();
    if (storage) writeDayPreference(storage, tournamentId, day);
  }, []);
  // Handed to the adapters, which are rebuilt on every state change, so the revision outlives them.
  const revisionStore: RevisionStore = useMemo(
    () => ({
      get: (tournamentId) => revisions.current[tournamentId] ?? null,
      set: (tournamentId, revision) => {
        revisions.current[tournamentId] = revision;
      },
    }),
    [],
  );
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);
  const [status, setStatus] = useState<Desk["status"]>(connected ? "loading" : "demo");
  const [error, setError] = useState<string | null>(null);
  const [accessProblem, setAccessProblem] = useState<DeskAccessProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishState, setPublishState] = useState<Desk["publishState"]>("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [member, setMember] = useState<Desk["member"]>(connected ? undefined : undefined);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // The playing day on screen, and the round each event's board belongs to. A save names the round,
  // so changing one day cannot rewrite the rest of the week.
  const [drawDay, setDrawDayState] = useState<number | null>(null);
  const drawDayRef = useRef<number | null>(null);
  const roundsRef = useRef<Record<string, string>>({});
  // Which draw action is the newest. A failed save restores the board only when nothing newer has
  // been dispatched, so a late failure cannot wipe an edit made after it.
  const drawSerial = useRef(0);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [networkOnline, setNetworkOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  // The queue and the dispatcher were created once; they read the current truth through this ref.
  // Writes are allowed only on a live, loaded desk: not while loading, not on a failed load, and
  // not on a saved copy.
  const canWriteRef = useRef(!connected);
  canWriteRef.current = !connected || (status === "ready" && networkOnline && cachedAt === null);

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

  // One read on load, and one more chance after it. Without a Supabase URL the desk stays on the
  // in-memory demo, unchanged.
  //
  // Why there is a second chance at all (gap 16): this provider sits in the **root** layout, so it
  // wraps the sign-in page too. Its one read therefore happens while the visitor is still signing in,
  // finds no session, and gives up. Signing in is a server action, so the redirect that follows is a
  // client-side navigation: the root layout does not remount, this effect does not run again, and the
  // desk sits on "Sign in to load the tournament desk" for someone who is already signed in. A
  // browser reload remounts everything, which is why that always appeared to fix it.
  //
  // The browser client cannot help either: the session arrived in a response from the server, so
  // `onAuthStateChange` in this tab never sees an event. Arriving at another route is the only signal
  // the page gets, so that is what is used, and only when the previous attempt found no session.
  const pathname = usePathname();
  const awaitingSession = useRef(false);
  useEffect(() => {
    if (awaitingSession.current) setReloadToken((n) => n + 1);
  }, [pathname]);

  useEffect(() => {
    if (!connected) {
      setStatus("demo");
      setMember(undefined);
      return;
    }
    let active = true;
    setStatus("loading");
    setError(null);
    const supabase = createSupabaseBrowserClient();

    /** "no-session" is kept apart from a failure: it is the one case worth trying again. */
    const load = async (): Promise<"ready" | "no-session" | "failed"> => {
      let userId: string | null = null;
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data.user) {
          // Worth another try when the route changes: see the comment on the effect below.
          awaitingSession.current = true;
          setAccessProblem(null);
          return "no-session";
        }
        userId = data.user.id;
        awaitingSession.current = false;
        const signedIn = await getDeskMember(supabase, userId);
        // The day this browser had open, restored once per mount. The saved day is used only for
        // the event it was chosen on (or when no event was named), so another event's days are never
        // assumed; the chosen event always wins over a stale saved one.
        const saved = restoreDayPreference();
        const preferredEvent =
          keepSelected.current ?? latest.current.activeTournamentId ?? saved?.tournamentId ?? null;
        // The day on screen comes first: choosing a day reloads the desk, and that reload must ask
        // for the chosen day. The remembered day is only for before anything was chosen.
        const preferredDay = dayToLoad({
          onScreen: drawDayRef.current,
          saved,
          eventId: preferredEvent,
        });
        const loaded = await loadDeskState(supabase, signedIn.clubId, {
          preferTournamentId: preferredEvent,
          dayNumber: preferredDay,
          // Only a remembered day may fall back: an event whose day was removed since the last
          // visit opens on its first round rather than failing the whole load.
          ...(preferredDay === null ? {} : { fallbackToFirstDay: true }),
        });
        if (!active) return "failed";
        keepSelected.current = null;
        setClient(supabase);
        setMember({ displayName: signedIn.displayName, role: signedIn.role });
        revisions.current = loaded.revisions;
        roundsRef.current = loaded.rounds;
        // The round the board was read from, as long as the event still calls it a playing day.
        const shownEvent = loaded.state.activeTournamentId;
        const shownDays = shownEvent ? playingDaysOfEvent(loaded.state.days[shownEvent] ?? []) : [];
        const boardDay = shownEvent ? (loaded.roundDays[shownEvent] ?? null) : null;
        let shownDay = shownDays.some((day) => day.dayNumber === boardDay) ? boardDay : null;
        // Defensive: a remembered day the event no longer plays (or a round with no day row) must
        // not leave the desk naming a day it cannot show. The first playing day is used and
        // remembered instead, without asking for another load.
        if (shownDay === null) {
          shownDay = shownDays[0]?.dayNumber ?? null;
          if (shownEvent && shownDay !== null) rememberDay(shownEvent, shownDay);
        }
        drawDayRef.current = shownDay;
        setDrawDayState(shownDay);
        rawDispatch({ type: "hydrate", state: loaded.state });
        setStatus("ready");
        setCachedAt(null);
        setAccessProblem(null);
        void saveDeskSnapshot(
          userId,
          signedIn.clubId,
          toDeskSnapshot(loaded, {
            displayName: signedIn.displayName,
            role: signedIn.role,
          }),
        );
        return "ready";
      } catch (loadError) {
        if (!active) return "failed";
        // An account with no club is not a failed read, and telling that person to retry sends them
        // round a loop that cannot end.
        setAccessProblem(loadError instanceof DeskAccessError ? loadError.problem : null);
        // A saved copy is shown only when the connection is genuinely down. A refusal from the
        // server (no club membership, a bad row, a policy) is a real answer, and covering it with
        // an older copy would hide the one thing the desk needs to see.
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        const savedFor = offline ? (userId ?? lastDeskUserId()) : null;
        const snapshot = savedFor ? await loadDeskSnapshot(savedFor) : null;
        if (!active) return "failed";
        if (snapshot) {
          setMember(snapshot.payload.member);
          revisions.current = snapshot.payload.revisions;
          rawDispatch({ type: "hydrate", state: snapshot.payload.state });
          setStatus("ready");
          setCachedAt(snapshot.savedAt);
          setError(null);
          return "ready";
        }
        setStatus("error");
        setError(
          offline
            ? NO_DESK_SNAPSHOT_NOTICE
            : loadError instanceof Error
              ? loadError.message
              : "Could not load the desk.",
        );
        return "failed";
      }
    };

    void (async () => {
      if ((await load()) !== "no-session") return;
      // One more attempt on the next tick, which is enough for a cookie that was set by the response
      // this render came with.
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!active) return;
      if ((await load()) !== "no-session") return;
      // Still nothing. Say so plainly rather than claiming the desk is broken.
      setStatus("error");
      setError("Sign in to load the tournament desk.");
    })();

    // A session can also arrive after this render: another tab signing in, or the cookie landing
    // late. Without this the desk would sit on the sign-in message until a manual reload.
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "SIGNED_IN") {
        void load();
        return;
      }
      if (event === "SIGNED_OUT") {
        setClient(null);
        setMember(undefined);
        setStatus("error");
        setError("Sign in to load the tournament desk.");
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [connected, reloadToken, rememberDay, restoreDayPreference]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  const setDrawDay = useCallback(
    (day: number | null) => {
      drawDayRef.current = day;
      setDrawDayState(day);
      // Remembered against the event it was chosen on, so switching events can tell whether the day
      // applies there. A day cleared to null leaves the last saved one alone.
      const tournamentId = latest.current.activeTournamentId;
      if (day !== null && tournamentId) rememberDay(tournamentId, day);
      setReloadToken((n) => n + 1);
    },
    [rememberDay],
  );
  const onEventCreated = useCallback((id: string) => {
    keepSelected.current = id;
    setReloadToken((n) => n + 1);
  }, []);

  // One queue for every draw write, so saves and publishes reach the database in the order the
  // organizer made them.
  const drawQueue = useRef<ReturnType<typeof createQueue> | null>(null);
  if (!drawQueue.current) {
    drawQueue.current = createQueue({
      onError: (message) => {
        setError(message);
        toast.push({ tone: "bad", title: "Not saved", detail: message });
      },
      onSaved: () => {
        setError(null);
        setLastSavedAt(new Date().toISOString());
      },
      onBusy: setSaving,
      canWrite: () => canWriteRef.current,
    });
  }

  const runDrawJob = useCallback(
    async (job: DrawJob, supabase: SupabaseClient<Database>): Promise<PublishResult | null> => {
      // The same store the setup write uses. Reading it here is what makes the two agree.
      const revision = revisionStore.get(job.tournamentId) ?? 0;
      if (job.kind === "save") {
        revisionStore.set(
          job.tournamentId,
          await saveDraw(
            supabase,
            job.tournamentId,
            revision,
            job.draw,
            job.overrides,
            // The round captured when the job was planned, not whatever day is on screen now.
            job.roundId,
          ),
        );
        return null;
      }
      if (job.kind === "publish") {
        const result = await publishPairings(supabase, job.tournamentId, revision, job.published);
        await refreshPublicPage(supabase);
        return result;
      }
      await unpublishPairings(supabase, job.tournamentId);
      await refreshPublicPage(supabase);
      return null;
    },
    [revisionStore],
  );

  // Applies an action to the newest state and shows it. Used after a write confirms, so a screen
  // changes once, when the database has the change, rather than before it.
  const apply = useCallback<Dispatch<Action>>((action) => {
    latest.current = reducer(latest.current, action);
    rawDispatch(action);
  }, []);

  // Shows exactly the published snapshot the database accepted, and nothing else. The rest of the
  // board stays as it is now: an edit made while the write was in flight must not be dropped, and
  // must not be shown as published either.
  const applyPublished = useCallback((tournamentId: string, published: Published | null) => {
    const current = latest.current;
    const board = current.boards[tournamentId];
    if (!board) return;
    const next: DeskState = {
      ...current,
      boards: { ...current.boards, [tournamentId]: { ...board, published } },
    };
    latest.current = next;
    rawDispatch({ type: "hydrate", state: next });
  }, []);

  // Puts a board back exactly as it was before a queued save that failed. The unsaved board must
  // never stay on screen, because a publish built from it would show players a draw the database
  // does not have.
  const applyBoard = useCallback((tournamentId: string, board: BoardState | undefined) => {
    if (!board) return;
    const current = latest.current;
    const next: DeskState = {
      ...current,
      boards: { ...current.boards, [tournamentId]: board },
    };
    latest.current = next;
    rawDispatch({ type: "hydrate", state: next });
  }, []);

  // The day on screen, as the reducer and the save jobs need it. The store owns the selection, so
  // filling it here keeps every screen from having to name the day on each action.
  const dayContext = useCallback(() => {
    const current = latest.current;
    const tournamentId = current.activeTournamentId;
    const tournament = current.tournaments.find((t) => t.id === tournamentId);
    const days = tournament ? playingDaysOfEvent(current.days[tournament.id] ?? []) : [];
    const day = days.find((entry) => entry.dayNumber === drawDayRef.current) ?? null;
    const excluded = new Set<string>();
    if (day && tournament) {
      for (const entry of current.entries) {
        if (entry.tournamentId !== tournament.id) continue;
        const chosen = entry.selectedDays ?? [];
        if (chosen.length > 0 && !chosen.includes(day.dayNumber)) excluded.add(entry.playerId);
      }
    }
    return { tournamentId, tournament, day, excluded };
  }, []);

  // Every screen dispatches through this. In demo mode it is the plain reducer; with Supabase the
  // draw actions are also queued for the database.
  const dispatch = useCallback<Dispatch<Action>>(
    (rawAction) => {
      // Switching events keeps the day on screen when the new event plays it too, so the organizer
      // lands on the same round rather than the first one. The choice is remembered against the new
      // event first, and the reload token below is what reads that event's board for that day.
      if (rawAction.type === "selectTournament") {
        const eventDays = rawAction.id ? (latest.current.days[rawAction.id] ?? []) : [];
        const nextDay = dayOnEventSwitch(drawDayRef.current, playingDaysOfEvent(eventDays));
        drawDayRef.current = nextDay;
        setDrawDayState(nextDay);
        keepSelected.current = rawAction.id;
        if (rawAction.id) {
          rememberDay(rawAction.id, nextDay);
          setReloadToken((n) => n + 1);
        }
      }
      const context = dayContext();
      // The demo has no saved rounds, so the first draw, and a start over, draws every playing day
      // at once, each with its own AM and PM sessions. A re-run that keeps locks stays on the day on
      // screen. "Make the draw" asks to keep locks too, so no draw yet counts as a first draw.
      const hasDraw = Boolean(
        context.tournamentId && latest.current.boards[context.tournamentId]?.draw,
      );
      const action: Action =
        rawAction.type === "generate" &&
        !connected &&
        (!rawAction.preserveLocks || !hasDraw) &&
        rawAction.dayNumber === undefined
          ? { type: "generateAllDays", showDay: context.day?.dayNumber ?? null }
          : rawAction.type === "generate"
            ? { ...rawAction, dayNumber: rawAction.dayNumber ?? context.day?.dayNumber ?? null }
            : rawAction.type === "publish"
              ? {
                  ...rawAction,
                  dayNumber: rawAction.dayNumber ?? context.day?.dayNumber ?? null,
                  dayLabel: rawAction.dayLabel ?? context.day?.label,
                  playDate: rawAction.playDate ?? context.day?.playDate,
                }
              : rawAction;
      const isPublish = action.type === "publish" || action.type === "unpublish";
      // A save that failed leaves the screen on the last saved board. Publishing then would need a
      // board the database never stored, so it waits for a successful save.
      if (action.type === "publish" && saveFailed) {
        setPublishState("failed");
        setPublishError("The last change was not saved. Fix it and save again before publishing.");
        toast.push({
          tone: "bad",
          title: "Not published",
          detail: "The last change was not saved, so there is nothing safe to publish yet.",
        });
        return;
      }
      const planOptions = {
        roundId: context.tournamentId ? (roundsRef.current[context.tournamentId] ?? null) : null,
        dayExcluded: context.day ? context.excluded : undefined,
      };
      // Offline is not a queue: the change is refused before it reaches the reducer, so the screen
      // cannot show a value that the database never received.
      if (connected && !LOCAL_ONLY_ACTIONS.has(action.type) && !canWriteRef.current) {
        setError(OFFLINE_WRITE_NOTICE);
        toast.push({ tone: "bad", title: "Not saved", detail: OFFLINE_WRITE_NOTICE });
        if (isPublish) {
          setPublishState("failed");
          setPublishError(OFFLINE_WRITE_NOTICE);
        }
        return;
      }
      if (!client || !DRAW_ACTIONS.has(action.type)) {
        const before = latest.current;
        const after = reducer(before, action);
        // Keep the ref ahead of the render. An adapter dispatches here and then reads
        // `currentState()` from its next queued write, which can run before React has committed
        // this action; without this it would read the state from before its own dispatch.
        latest.current = after;
        rawDispatch(action);
        const notice = actionNotice(action, before, after);
        if (notice) toast.push(notice);
        return;
      }
      const before = latest.current;
      const after = reducer(before, action);

      if (isPublish) {
        const jobs = planDrawJobs(action, before, after, planOptions);
        // Nothing to write: the reducer refused the action (blocking issues) or there was no
        // published copy to take down. The screen must not claim anything changed.
        if (jobs.length === 0) {
          if (action.type === "publish") {
            setPublishState("failed");
            setPublishError(
              "The pairings were not published. Check the problems above and try again.",
            );
            toast.push({
              tone: "bad",
              title: "Not published",
              detail: "Check the problems on the draw, then publish again.",
            });
          }
          return;
        }
        setPublishError(null);
        setPublishState("working");
        for (const job of jobs) {
          drawQueue.current?.(async () => {
            try {
              const result = await runDrawJob(job, client);
              if (job.kind === "publish") {
                // The snapshot the database accepted, not a fresh one built from the screen.
                const accepted = after.boards[job.tournamentId]?.published ?? null;
                if (!accepted) {
                  setPublishState("failed");
                  setPublishError(
                    "The pairings were published, but this screen could not show them. Open the draw again.",
                  );
                  return;
                }
                // Shown only now, and then stamped with the version the database assigned.
                applyPublished(job.tournamentId, accepted);
                toast.push({
                  tone: "ok",
                  title: action.type === "unpublish" ? "Pairings taken down" : "Pairings published",
                  detail:
                    action.type === "unpublish"
                      ? "Players see “not out yet” until you publish again."
                      : result
                        ? `Version ${result.version} is what players see.`
                        : "Players can see this list.",
                });
                if (result) {
                  apply({
                    type: "publishAck",
                    tournamentId: job.tournamentId,
                    version: result.version,
                    at: result.at,
                  });
                }
              } else {
                // Nothing is published any more; the old snapshot goes only after the write lands.
                applyPublished(job.tournamentId, null);
                toast.push({
                  tone: "info",
                  title: "Pairings taken down",
                  detail: "Players see “not out yet” until you publish again.",
                });
              }
              setPublishState("idle");
            } catch (error) {
              setPublishState("failed");
              setPublishError(
                error instanceof Error ? error.message : "Could not save the pairings.",
              );
              toast.push({
                tone: "bad",
                title: "Pairings not saved",
                detail: error instanceof Error ? error.message : "Could not save the pairings.",
              });
              // The queue reports it to the session bar as well.
              throw error;
            }
          });
        }
        return;
      }

      const serial = ++drawSerial.current;
      const jobs = planDrawJobs(action, before, after, planOptions);
      const takedown = jobs.find((job) => job.kind === "unpublish");

      if (takedown) {
        // "Start over" takes the published list down as well. The screen keeps showing the old
        // snapshot until the database confirms the takedown: a refused write must not leave the
        // desk saying players cannot see a list that is still up.
        const board = after.boards[takedown.tournamentId];
        const was = before.boards[takedown.tournamentId]?.published ?? null;
        latest.current = board
          ? {
              ...after,
              boards: {
                ...after.boards,
                [takedown.tournamentId]: {
                  ...board,
                  published: publishedWhileWritesPending(jobs, was, board.published),
                },
              },
            }
          : after;
        rawDispatch({ type: "hydrate", state: latest.current });
      } else {
        latest.current = after;
        rawDispatch(action);
      }

      const notice = actionNotice(action, before, after);
      if (notice) toast.push(notice);
      for (const job of jobs) {
        drawQueue.current?.(async () => {
          try {
            await runDrawJob(job, client);
            if (job.kind === "save") setSaveFailed(false);
            // The takedown landed; the old snapshot goes only now.
            if (job.kind === "unpublish") applyPublished(job.tournamentId, null);
          } catch (error) {
            if (job.kind === "save") {
              setSaveFailed(true);
              // Put the last saved board back, unless a newer action has replaced this one.
              if (serial === drawSerial.current) {
                applyBoard(job.tournamentId, before.boards[job.tournamentId]);
              }
            }
            throw error;
          }
        });
      }
    },
    [apply, applyBoard, applyPublished, client, connected, rememberDay, runDrawJob, saveFailed],
  );

  const adapters = useMemo<Adapters>(() => {
    if (!connected || !client) return createMockAdapters(state, dispatch);
    return createSupabaseAdapters(state, dispatch, {
      client,
      clubId: state.clubId,
      revisions: revisionStore,
      canWrite: () => canWriteRef.current,
      // A queued write can finish after a later edit, so its rollback compares against the newest
      // state rather than the render this adapter was built from.
      currentState: () => latest.current,
      onError: setError,
      onSaved: () => {
        setError(null);
        setLastSavedAt(new Date().toISOString());
      },
      onBusy: setSaving,
      onEventCreated,
    });
  }, [state, connected, client, dispatch, onEventCreated, revisionStore]);

  const scoring = useMemo<ScoringRepository>(() => {
    if (!connected || !client) return createDemoScoringRepository(buildDemoScoringSeed());
    return createSupabaseScoringRepository({ client });
  }, [connected, client]);

  // The demo keeps every playing day's board in memory (a fresh draw makes them all at once), so
  // choosing a day shows that day's own AM and PM board. A connected desk loads the saved round.
  const shownDayRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (connected) return;
    const previous = shownDayRef.current;
    shownDayRef.current = drawDay;
    if (previous === undefined || previous === drawDay) return;
    if (drawDay !== null) dispatch({ type: "showDay", from: previous, to: drawDay });
  }, [connected, drawDay, dispatch]);

  // The demo starts on the first playing day, because a day is what a draw is made for.
  useEffect(() => {
    if (connected || drawDay !== null) return;
    const current = latest.current;
    const tournament = current.tournaments.find((t) => t.id === current.activeTournamentId);
    const first = tournament ? playingDaysOfEvent(current.days[tournament.id] ?? [])[0] : undefined;
    if (!first) return;
    drawDayRef.current = first.dayNumber;
    setDrawDayState(first.dayNumber);
  }, [connected, drawDay]);

  const value = useMemo<Desk>(() => {
    const tournament = activeTournament(state);
    const board = boardOf(state);
    const registrations = buildRegistrations(state);
    const days = tournament ? (state.days[tournament.id] ?? daysOfTournament(tournament)) : [];
    const entries = (tournament ? entriesFor(state, tournament.id) : []).map((entry) => ({
      ...entry,
      selectedDays: selectedDaysOf(entry, days),
    }));
    const draw = board.draw;
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
        name: displayName(draft.name),
        fullName: draft.name,
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
      return registrationFor({ tournament, tees: state.tees, player, entry, records: [] });
    };

    return {
      state,
      club: state.club,
      tournaments: state.tournaments,
      tournament,
      tees: state.tees,
      holes: state.holes,
      days,
      players: state.players,
      playerById: new Map(state.players.map((p) => [p.id, p])),
      entries,
      caddies: state.caddies,
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
      // Compared per playing day: another day's published copy is not a change to this one.
      changedSincePublish:
        board.published !== null &&
        draw !== null &&
        publishedSignatureForDay(board.published, drawDay) !== drawSignatureForDay(draw, drawDay),
      names: {
        category: lookup(tournament?.categories ?? []),
        flight: lookup(tournament?.flights ?? []),
        tee: lookup(state.tees),
      },
      deferred: state.deferred,
      pendingRefreeze: registrations.filter((r) => r.frozenOutdated),
      flags: flagsOf(registrations),
      adapters,
      dispatch,
      classifyDraft,
      status,
      error,
      accessProblem,
      saving,
      saveFailed,
      publishState,
      publishError,
      member: connected ? member : undefined,
      scoring,
      lastSavedAt,
      offline: connected && (!networkOnline || cachedAt !== null),
      cachedAt,
      reload,
      drawDay,
      setDrawDay,
    };
  }, [
    state,
    adapters,
    scoring,
    dispatch,
    status,
    error,
    accessProblem,
    saving,
    saveFailed,
    publishState,
    publishError,
    member,
    connected,
    lastSavedAt,
    networkOnline,
    cachedAt,
    reload,
    drawDay,
    setDrawDay,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesk(): Desk {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDesk must be used inside DeskProvider");
  return v;
}
