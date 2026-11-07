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
  buildRegistrations,
  type DeskState,
  flagsOf,
  type Published,
} from "@/lib/store/state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";
import { actionNotice } from "./action-notice";
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
  "move",
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
  const [reloadToken, setReloadToken] = useState(0);
  // The playing day on screen, and the round each event's board belongs to. A save names the round,
  // so changing one day cannot rewrite the rest of the week.
  const [drawDay, setDrawDayState] = useState<number | null>(null);
  const drawDayRef = useRef<number | null>(null);
  const roundsRef = useRef<Record<string, string>>({});
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
        const loaded = await loadDeskState(supabase, signedIn.clubId, {
          preferTournamentId: keepSelected.current ?? latest.current.activeTournamentId,
          dayNumber: drawDayRef.current,
        });
        if (!active) return "failed";
        keepSelected.current = null;
        setClient(supabase);
        setMember({ displayName: signedIn.displayName, role: signedIn.role });
        revisions.current = loaded.revisions;
        roundsRef.current = loaded.rounds;
        const shownDay = loaded.roundDays[loaded.state.activeTournamentId ?? ""] ?? null;
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
  }, [connected, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  const setDrawDay = useCallback((day: number | null) => {
    drawDayRef.current = day;
    setDrawDayState(day);
    setReloadToken((n) => n + 1);
  }, []);
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
            roundsRef.current[job.tournamentId] ?? null,
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

  // Every screen dispatches through this. In demo mode it is the plain reducer; with Supabase the
  // draw actions are also queued for the database.
  const dispatch = useCallback<Dispatch<Action>>(
    (action) => {
      const isPublish = action.type === "publish" || action.type === "unpublish";
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
        rawDispatch(action);
        const notice = actionNotice(action, before, after);
        if (notice) toast.push(notice);
        return;
      }
      const before = latest.current;
      const after = reducer(before, action);

      if (isPublish) {
        const jobs = planDrawJobs(action, before, after);
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

      const jobs = planDrawJobs(action, before, after);
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
          await runDrawJob(job, client);
          // The takedown landed; the old snapshot goes only now.
          if (job.kind === "unpublish") applyPublished(job.tournamentId, null);
        });
      }
    },
    [apply, applyPublished, client, connected, runDrawJob],
  );

  const adapters = useMemo<Adapters>(() => {
    if (!connected || !client) return createMockAdapters(state, dispatch);
    return createSupabaseAdapters(state, dispatch, {
      client,
      clubId: state.clubId,
      revisions: revisionStore,
      canWrite: () => canWriteRef.current,
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
      changedSincePublish:
        board.published !== null && draw !== null && board.published.signature !== signature,
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
