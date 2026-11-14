"use client";

import Link from "next/link";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RoleGate } from "@/components/desk";
import { BoardCommandBar } from "@/components/draw/BoardCommandBar";
import { dropTargetAt, sameTarget, TOUCH_DRAG_THRESHOLD } from "@/components/draw/board-drag";
import { DrawTable } from "@/components/draw/DrawTable";
import { FlightQueuePanel } from "@/components/draw/FlightQueuePanel";
import { GroupCard } from "@/components/draw/GroupCard";
import { IssuesPanel } from "@/components/draw/IssuesPanel";
import { LiveModeBar } from "@/components/draw/LiveModeBar";
import { PairingSheetImport } from "@/components/draw/PairingSheetImport";
import { PlayerIndexDialog } from "@/components/draw/PlayerIndexDialog";
import { PublishDialog } from "@/components/draw/PublishDialog";

import { type Selection, SidePanel, type Tab } from "@/components/draw/SidePanel";
import { NeedsTournament } from "@/components/NeedsTournament";
import { fmtIso } from "@/lib/data/labels";
import { partnerOf } from "@/lib/data/registrations";
import { classMismatches, classMismatchIssues } from "@/lib/draw/class-mismatch";
import { sessionFinderFor } from "@/lib/draw/day-sessions";
import { type DropIntent, type DropTarget, dropIntent } from "@/lib/draw/drop-intent";
import { buildFlightQueue } from "@/lib/draw/flight-queue";
import {
  buildPairingSections,
  type PairingCategorization,
  type PairingFlight,
} from "@/lib/draw/pairing-sections";
import { buildDrawTable } from "@/lib/draw/table-model";
import { type DrawGroup, type Issue, validateDraw } from "@/lib/draw/validate";
import { fmtTime } from "@/lib/format";
import type { PairingCandidate } from "@/lib/import/pairing-sheet";
import { UNCLASSIFIED_LABEL } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";
import { isUnclassifiedGroup } from "@/lib/store/state";

const REASONS = [
  "Organizer request",
  "Balance the group",
  "Friends or club-mates together",
  "Late change on the day",
  "Other (note in the overrides list)",
];

export default function DrawPage() {
  const desk = useDesk();
  const {
    tournament,
    registrations,
    regById,
    entryByPlayer,
    unplaced,
    playerById,
    names,
    dispatch,
    isPublished,
    changedSincePublish,
    flags,
    overrides,
    adapters,
    member,
    status,
    entries,
    tees,
    days,
    drawDay,
    setDrawDay,
    canUndo,
    undoLastChange,
  } = desk;
  const draw = desk.draw;
  const config = tournament?.config ?? null;

  const [active, setActive] = useState<{ id: string; via: "pick" | "drag" } | null>(null);
  // Players ticked with the row checkboxes, in the order they were ticked.
  const [checked, setChecked] = useState<string[]>([]);
  // A set swap waiting for its second set: the first set is frozen while the desk ticks the other.
  const [swapSel, setSwapSel] = useState<{ base: string[]; picks: string[] } | null>(null);
  // The first player of a two-player swap, waiting for the second.
  const [swapFirst, setSwapFirst] = useState<string | null>(null);
  // The group a ticked set is being moved into.
  const [moveTarget, setMoveTarget] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("pool");
  // The check list is long, so it lives on its own tab and the groups are visible on opening.
  const [view, setView] = useState<"board" | "checks" | "queue">("board");
  // AM, PM or both. Every playing day runs a morning and an afternoon session.
  const [sessionFilter, setSessionFilter] = useState<"all" | "AM" | "PM">("all");
  const [classFilter, setClassFilter] = useState("all");
  // Flight-first is the default; class-first is the older order, kept as a toggle (issue 205).
  const [categorization, setCategorization] = useState<PairingCategorization>("flight");
  // Cards edit; the table is the printed pairing layout, for reading a class at a glance.
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  const [flash, setFlash] = useState<number | null>(null);
  // The place a drag is over, so the board can say what letting go would do.
  const [hover, setHover] = useState<DropTarget | null>(null);
  // A drop that could take the player alone or with their registered pair, waiting for the choice.
  const [pairAsk, setPairAsk] = useState<{
    playerId: string;
    partnerId: string;
    toGroup: number;
  } | null>(null);
  // The short line after a drop, with Undo. It clears itself so the board is not left with stale news.
  const [dropNote, setDropNote] = useState<{
    tone: "ok" | "bad" | "info";
    text: string;
  } | null>(null);
  // The group a dropped player was offered for swapping, so its rows are marked.
  const [swapAsk, setSwapAsk] = useState<number | null>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const [confirm, setConfirm] = useState<"startOver" | "unpublish" | null>(null);
  const [reason, setReason] = useState(REASONS[0] as string);
  // The player whose index is being corrected from this board, by player id.
  const [indexPlayer, setIndexPlayer] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const shotgun = config?.startFormat === "shotgun";
  // The draw is built once for the event, but an event can run over several playing days. The day
  // selector decides which side of that one draw this screen shows.
  const playingDays = useMemo(() => days.filter((d) => d.isPlayingDay), [days]);
  // The selector changes which playing day's board is loaded, not just what is hidden: the board on
  // file belongs to one day, and every draw save names that day.
  const day = drawDay;
  const setDay = setDrawDay;
  const dayByPlayer = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const e of entries) m.set(e.playerId, e.selectedDays ?? []);
    return m;
  }, [entries]);
  // A player with no day recorded is never hidden by the filter: only a player who chose other days
  // is left out, so a missing value cannot make someone disappear from the board.
  const onDay = useCallback(
    (playerId: string) => {
      if (day === null) return true;
      const chosenDays = dayByPlayer.get(playerId);
      if (!chosenDays || chosenDays.length === 0) return true;
      return chosenDays.includes(day);
    },
    [day, dayByPlayer],
  );
  const chosenDay = playingDays.find((d) => d.dayNumber === day) ?? null;
  const visibleDraw = draw
    ? day === null
      ? draw
      : draw.filter((g) => g.playerIds.some(onDay))
    : null;
  // The session each group belongs to, read from its start time, with the tally for the tabs.
  const sessionOfTime = useMemo(() => sessionFinderFor(days, day), [days, day]);
  const sessionTally = (["AM", "PM"] as const)
    .map((key) => {
      const inSession = (visibleDraw ?? []).filter((g) => sessionOfTime(g.time) === key);
      return {
        key,
        groups: inSession.length,
        players: inSession.reduce((n, g) => n + g.playerIds.length, 0),
      };
    })
    .filter((row) => row.groups > 0);
  const activeSession = sessionTally.some((row) => row.key === sessionFilter)
    ? sessionFilter
    : "all";
  const sessionDraw =
    visibleDraw && activeSession !== "all"
      ? visibleDraw.filter((g) => sessionOfTime(g.time) === activeSession)
      : visibleDraw;
  const mixedGroups =
    day === null ? [] : (visibleDraw ?? []).filter((g) => g.playerIds.some((id) => !onDay(id)));
  const ready = registrations.filter((r) => r.status === "ok").length;
  const readyOnDay =
    day === null
      ? ready
      : registrations.filter((r) => r.status === "ok" && onDay(r.playerId)).length;
  // Everyone entered for the day, offered to the pairing sheet match by name. An entry still waiting
  // for review counts: the organizer put that player on the sheet, and the desk can finish the
  // entry afterwards. An ineligible entry does not.
  const pairingCandidates = useMemo<PairingCandidate[]>(
    () =>
      registrations
        .filter((r) => r.status !== "ineligible" && onDay(r.playerId))
        .map((r) => ({ registrationId: r.playerId, fullName: r.playerName })),
    [registrations, onDay],
  );
  const provisional = registrations.filter((r) => r.provisional);
  const provisionalCount = provisional.length;
  const onBoard = new Set(draw?.flatMap((g) => g.playerIds) ?? []);
  const provisionalOffBoard = draw ? provisional.filter((r) => !onBoard.has(r.playerId)) : [];
  // A missing index is not on this list: the event rule treats it as 0, so it never holds a player
  // out of the draw.
  const missingSummary = (["birthdate", "gender"] as const)
    .map((fact) => ({ fact, n: provisional.filter((r) => r.missing.includes(fact)).length }))
    .filter((item) => item.n > 0)
    .map((item) => `${item.n} without ${item.fact}`)
    .join(", ");
  const placed = visibleDraw?.reduce((n, g) => n + g.playerIds.filter(onDay).length, 0) ?? 0;

  // The players who chose this day. A player who chose another day is not "unplaced" here, so a
  // day-filtered board never blocks publishing for a name the day does not hold.
  const dayMembers = useMemo(
    () =>
      day === null
        ? undefined
        : new Set(
            entries
              .filter((entry) => {
                const chosen = entry.selectedDays ?? [];
                return chosen.length === 0 || chosen.includes(day);
              })
              .map((entry) => entry.playerId),
          ),
    [entries, day],
  );
  const issues = useMemo(
    () =>
      draw && config
        ? validateDraw({
            draw,
            registrations,
            config,
            engineWarnings: desk.warnings,
            flags,
            names,
            dayNumber: day,
            dayMembers,
          })
        : [],
    [draw, registrations, config, desk.warnings, flags, names, day, dayMembers],
  );
  const issuesByGroup = useMemo(() => {
    const m = new Map<number, Issue[]>();
    for (const i of issues) if (i.group) m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return m;
  }, [issues]);
  const none: Issue[] = useMemo(() => [], []);
  const blockingCount = issues.filter((i) => i.severity === "blocking").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  // A player whose index was corrected straight from the board stays in the group they were drawn
  // in, so the entry's class can stop matching the group's class. Reported on the card and in the
  // checks list as a note. It never blocks a publish and nothing is re-routed.
  const classGroups = useMemo(
    () =>
      classMismatches({
        draw: draw ?? [],
        registrations,
        flights: tournament?.flights ?? [],
      }),
    [draw, registrations, tournament?.flights],
  );
  const classNoteOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of classGroups) {
      for (const player of group.players) map.set(player.playerId, player.note);
    }
    return map;
  }, [classGroups]);
  const classCountByGroup = useMemo(
    () => new Map(classGroups.map((group) => [group.group, group.players.length])),
    [classGroups],
  );
  const classNoteIssues = useMemo(() => classMismatchIssues(classGroups), [classGroups]);
  // The checks list shows the ordinary issues and these notes. The tiles and the publish dialog keep
  // reading `issues`, because a class note is not a fault in the draw.
  const panelIssues = useMemo(() => [...issues, ...classNoteIssues], [issues, classNoteIssues]);
  const classMismatchOf = useCallback((id: string) => classNoteOf.get(id) ?? null, [classNoteOf]);
  // The same gate the register list uses for its index edit.
  const canEditIndex =
    status === "demo" || member?.role === "owner" || member?.role === "organizer";

  // Escape drops whatever is picked up, including a swap waiting for its second player.
  useEffect(() => {
    if (!active && !swapFirst && !swapSel && !pairAsk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setActive(null);
      setSwapFirst(null);
      setSwapSel(null);
      setSwapAsk(null);
      setPairAsk(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, swapFirst, swapSel, pairAsk]);

  // Another playing day is another board, so a selection made on the last one cannot stay.
  useEffect(() => {
    setChecked([]);
    setSwapSel(null);
    setSwapFirst(null);
    setSwapAsk(null);
    setPairAsk(null);
    setMoveTarget("");
  }, [day]);

  const revealPanel = () => {
    if (window.matchMedia("(max-width: 1099px)").matches) {
      panelRef.current?.scrollIntoView({ block: "nearest" });
    }
  };

  const focusGroup = useCallback((n: number) => {
    setSelection({ kind: "group", n });
    setFlash(n);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1600);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(`group-${n}`)
      ?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  }, []);

  const selectPlayer = useCallback((id: string) => {
    setSelection({ kind: "player", id });
    setTab("details");
    revealPanel();
  }, []);

  const selectGroup = useCallback((n: number) => {
    setSelection({ kind: "group", n });
    setTab("details");
    revealPanel();
  }, []);

  const showPlayer = useCallback(
    (id: string) => {
      selectPlayer(id);
      const g = draw?.find((x) => x.playerIds.includes(id));
      if (g) focusGroup(g.number);
    },
    [selectPlayer, focusGroup, draw],
  );

  const onShowIssue = (i: Issue) => {
    if (i.playerId && !i.group) {
      setTab("pool");
      setSelection({ kind: "player", id: i.playerId });
    } else if (i.group) {
      focusGroup(i.group);
      setTab("details");
    }
  };

  const onPick = useCallback((id: string | null) => {
    setActive(id ? { id, via: "pick" } : null);
  }, []);
  // The dragged player lives in a ref as well as state: drop targets must answer "may I?" during
  // the very first dragover, before React has re-rendered.
  const dragId = useRef<string | null>(null);
  // The player in hand as the last render saw it, for the drop handlers that run between renders.
  const activeIdRef = useRef<string | null>(null);
  const onDragStart = useCallback((id: string) => {
    dragId.current = id;
    setPairAsk(null);
    setDropNote(null);
    // Changing the page inside dragstart can cancel the drag in Chrome, so wait a tick.
    setTimeout(() => setActive({ id, via: "drag" }), 0);
  }, []);
  const onDragEnd = useCallback(() => {
    dragId.current = null;
    setActive(null);
    setHover(null);
  }, []);
  const onHoverTarget = useCallback((target: DropTarget | null) => {
    setHover((current) => (sameTarget(current, target) ? current : target));
  }, []);
  const onLock = useCallback(
    (n: number, locked: boolean) => dispatch({ type: "setGroupLocked", group: n, locked, reason }),
    [dispatch, reason],
  );

  // The queue reads the whole board for the loaded day, never the class or day filter, so a hole's
  // queue is always complete.
  const queueModel = useMemo(
    () =>
      buildFlightQueue(
        (draw ?? []).filter(
          (g) => activeSession === "all" || sessionOfTime(g.time) === activeSession,
        ),
        tournament?.flights ?? [],
        config?.holes ?? 18,
        sessionOfTime,
      ),
    [draw, tournament?.flights, config?.holes, activeSession, sessionOfTime],
  );
  // The flight each group belongs to, used when the board is grouped flight-first (issue 205).
  const flightByGroup = useMemo(() => {
    const map = new Map<number, PairingFlight>();
    for (const hole of queueModel.byHole) {
      for (const entry of hole.entries) {
        map.set(entry.groupNumber, {
          time: entry.time,
          letter: entry.letter,
          session: entry.session,
        });
      }
    }
    return map;
  }, [queueModel]);
  const flightOf = useCallback(
    (g: DrawGroup) => flightByGroup.get(g.number) ?? null,
    [flightByGroup],
  );
  // The hole with its flight letter ("1A", "12B") for each group, shown on the cards and in Details.
  const slotByGroup = useMemo(() => {
    const slots = new Map<number, string>();
    for (const queue of queueModel.byHole) {
      for (const entry of queue.entries) slots.set(entry.groupNumber, entry.slot);
    }
    return slots;
  }, [queueModel]);
  const slotOf = useCallback((groupNumber: number) => slotByGroup.get(groupNumber), [slotByGroup]);
  // A shotgun group can start on any hole; a two-tee start only has hole 1 and hole 10.
  const holeOptions = useMemo(
    () =>
      shotgun ? Array.from({ length: config?.holes ?? 18 }, (_, index) => index + 1) : [1, 10],
    [shotgun, config?.holes],
  );
  const onQueueMove = useCallback(
    (groupNumber: number, hole: number) =>
      dispatch({ type: "moveGroupToHole", groupNumber, hole, reason }),
    [dispatch, reason],
  );
  const onQueueSwap = useCallback(
    (a: number, b: number) => dispatch({ type: "swapGroupSlots", a, b, reason }),
    [dispatch, reason],
  );
  const onQueueReorder = useCallback(
    (hole: number, order: number[]) => dispatch({ type: "reorderHoleQueue", hole, order, reason }),
    [dispatch, reason],
  );

  const moveActiveTo = useCallback(
    (n: number) => {
      if (!active) return;
      dispatch({ type: "move", playerId: active.id, toGroup: n, reason });
      setSelection({ kind: "player", id: active.id });
      setActive(null);
    },
    [active, dispatch, reason],
  );

  // ---- Hand edits of who is in a group: swap two players, move a set, swap two sets ----
  const nameOf = useCallback(
    (id: string) => playerById.get(id)?.name ?? "Unknown player",
    [playerById],
  );
  // A swap starts from the Move button's pick or from a row's Swap button, and the second row the
  // desk presses completes it.
  const swapFrom = swapFirst ?? (active?.via === "pick" ? active.id : null);
  const swapFromName = swapFrom ? nameOf(swapFrom) : null;

  const runSwap = useCallback(
    (a: string, b: string) => {
      dispatch({ type: "swapPlayers", a, b, reason });
      setSwapFirst(null);
      setSwapAsk(null);
      setActive(null);
      setSelection({ kind: "player", id: b });
    },
    [dispatch, reason],
  );

  const onSwapWith = useCallback(
    (id: string) => {
      setSwapAsk(null);
      if (!swapFrom) {
        setSwapFirst(id);
        setActive(null);
        return;
      }
      if (swapFrom === id) {
        setSwapFirst(null);
        setActive(null);
        return;
      }
      runSwap(swapFrom, id);
    },
    [swapFrom, runSwap],
  );

  const toggleCheck = useCallback(
    (id: string) => {
      if (swapSel) {
        // The first set is frozen; ticks now build the set it is swapped with.
        setSwapSel((current) => {
          if (!current || current.base.includes(id)) return current;
          if (current.picks.includes(id)) {
            return { ...current, picks: current.picks.filter((other) => other !== id) };
          }
          if (current.picks.length >= current.base.length) return current;
          return { ...current, picks: [...current.picks, id] };
        });
        return;
      }
      setChecked((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
    },
    [swapSel],
  );

  const selectSet = useCallback((ids: string[]) => {
    setSwapSel(null);
    setChecked((current) => {
      const next = [...current];
      for (const id of ids) if (!next.includes(id)) next.push(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setChecked([]);
    setSwapSel(null);
    setMoveTarget("");
  }, []);

  // The other players of a registered pair or team who are on the board. Derived from the entry,
  // never stored here.
  const pairPartners = useMemo(() => {
    const byKey = new Map<string, string[]>();
    for (const g of draw ?? []) {
      for (const id of g.playerIds) {
        const reg = regById.get(id);
        const key = reg?.pairKey ?? reg?.teamKey;
        if (!key) continue;
        byKey.set(key, [...(byKey.get(key) ?? []), id]);
      }
    }
    const map = new Map<string, string[]>();
    for (const ids of byKey.values()) {
      for (const id of ids)
        map.set(
          id,
          ids.filter((other) => other !== id),
        );
    }
    return map;
  }, [draw, regById]);
  const pairOf = useCallback((id: string) => pairPartners.get(id) ?? [], [pairPartners]);

  // ---- Drag and drop: a new way to start the same swaps and moves ----
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The one line after a drop. It clears itself so the board is not left with stale news. */
  const showDropNote = useCallback((tone: "ok" | "bad" | "info", text: string) => {
    setDropNote({ tone, text });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setDropNote(null), 12000);
  }, []);

  /**
   * What releasing the player in hand over one place would do. Cards and the table both ask this.
   * It reads the drag ref as well as the state, so the very first dragover already knows the
   * answer, before React has re-rendered with the dragged player.
   */
  const intentFor = useCallback(
    (target: DropTarget): DropIntent | null => {
      const playerId = dragId.current ?? activeIdRef.current;
      if (!playerId || !draw || !config) return null;
      return dropIntent({
        draw,
        config,
        regs: regById,
        names,
        playerId,
        target,
        pairOf,
        nameOf,
      });
    },
    [draw, config, regById, names, pairOf, nameOf],
  );

  /**
   * Carries out one drop. Every branch dispatches an action the buttons already dispatch, so a drop
   * writes exactly what a button writes and the rules stay in one place.
   */
  const resolveDrop = useCallback(
    (playerId: string, target: DropTarget) => {
      if (!draw || !config) return;
      const intent = dropIntent({
        draw,
        config,
        regs: regById,
        names,
        playerId,
        target,
        pairOf,
        nameOf,
      });
      switch (intent.kind) {
        case "none":
          return;
        case "refused":
          showDropNote("bad", intent.reason);
          return;
        case "swap":
          dispatch({ type: "swapPlayers", a: intent.a, b: intent.b, reason });
          setSwapFirst(null);
          setSwapAsk(null);
          setSelection({ kind: "player", id: intent.b });
          showDropNote("ok", `Swapped ${nameOf(intent.a)} with ${nameOf(intent.b)}.`);
          return;
        case "move":
          dispatch({ type: "move", playerId: intent.playerId, toGroup: intent.toGroup, reason });
          setSelection({ kind: "player", id: intent.playerId });
          showDropNote("ok", `Moved ${nameOf(intent.playerId)} to group ${intent.toGroup}.`);
          return;
        case "moveOrPair":
          // Nothing is written until the desk says whether the pair comes too.
          setPairAsk({
            playerId: intent.playerId,
            partnerId: intent.partnerId,
            toGroup: intent.toGroup,
          });
          return;
        case "pickSwap":
          // The same offer the Swap button makes: the desk picks the row next.
          setSwapFirst(intent.playerId);
          setSwapAsk(intent.group);
          setActive(null);
          setSelection({ kind: "group", n: intent.group });
          showDropNote("info", intent.label);
          return;
      }
    },
    [draw, config, regById, names, pairOf, nameOf, dispatch, reason, showDropNote],
  );

  const resolveRef = useRef(resolveDrop);
  resolveRef.current = resolveDrop;
  activeIdRef.current = active?.id ?? null;

  /** Releases the player in hand on one place. Shared by the mouse drop and the finger drop. */
  const onDropTarget = useCallback((target: DropTarget | null) => {
    const id = dragId.current ?? activeIdRef.current;
    dragId.current = null;
    setHover(null);
    setActive(null);
    if (!id || !target) return;
    resolveRef.current(id, target);
  }, []);

  /** The pair choice a drop can raise: this player alone, or the pair. */
  const takePairChoice = useCallback(
    (take: "one" | "both") => {
      if (!pairAsk) return;
      const { playerId, partnerId, toGroup } = pairAsk;
      if (take === "both") {
        dispatch({ type: "moveSet", playerIds: [playerId, partnerId], toGroup, reason });
        showDropNote(
          "ok",
          `Moved ${nameOf(playerId)} and ${nameOf(partnerId)} to group ${toGroup}.`,
        );
      } else {
        dispatch({ type: "move", playerId, toGroup, reason });
        showDropNote("ok", `Moved ${nameOf(playerId)} to group ${toGroup}.`);
      }
      setSelection({ kind: "player", id: playerId });
      setPairAsk(null);
    },
    [pairAsk, dispatch, reason, nameOf, showDropNote],
  );

  // Touch has no HTML5 drag, so a finger on the grip starts the same drag through pointer events.
  // The place under the finger is read back from the board's own drop markers.
  const pointerDrag = useRef<{
    id: string;
    x: number;
    y: number;
    pointerId: number;
    moving: boolean;
  } | null>(null);
  const onPointerDragStart = useCallback((id: string, e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse") return; // a mouse uses the browser's own drag events
    pointerDrag.current = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, moving: false };
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const drag = pointerDrag.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.moving) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < TOUCH_DRAG_THRESHOLD) return;
        drag.moving = true;
        dragId.current = drag.id;
        setPairAsk(null);
        setDropNote(null);
        setActive({ id: drag.id, via: "drag" });
      }
      e.preventDefault();
      const target = dropTargetAt(e.clientX, e.clientY);
      setHover((current) => (sameTarget(current, target) ? current : target));
    };
    const finish = (e: PointerEvent, cancelled: boolean) => {
      const drag = pointerDrag.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      pointerDrag.current = null;
      // A tap, not a drag: the ordinary click on the row still happens.
      if (!drag.moving) return;
      if (cancelled) {
        dragId.current = null;
        setHover(null);
        setActive(null);
        return;
      }
      onDropTarget(dropTargetAt(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => finish(e, false);
    const cancel = (e: PointerEvent) => finish(e, true);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [onDropTarget]);

  const moveChecked = useCallback(
    (toGroup: number) => {
      dispatch({ type: "moveSet", playerIds: checked, toGroup, reason });
      clearSelection();
    },
    [checked, dispatch, reason, clearSelection],
  );

  const swapChecked = useCallback(() => {
    if (!swapSel) return;
    dispatch({ type: "swapSets", setA: swapSel.base, setB: swapSel.picks, reason });
    clearSelection();
  }, [swapSel, dispatch, reason, clearSelection]);

  function makeDraw(preserveLocks: boolean) {
    adapters.router.propose(preserveLocks);
    setConfirm(null);
    setActive(null);
    setSelection(null);
  }

  // The two steps behind a stale draw. Freezing writes the registrations first and the screen
  // follows once the database answers, so a refused write leaves the old index in place and says so.
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState("");
  async function fixCause(action: "refreeze" | "redraw") {
    setFixError("");
    if (action === "redraw") {
      makeDraw(true);
      return;
    }
    const ids = entries.filter((e) => regById.get(e.playerId)?.frozenOutdated).map((e) => e.id);
    if (ids.length === 0 || !tournament) return;
    setFixing(true);
    try {
      await adapters.registrations.refreeze(tournament.id, ids);
    } catch (error) {
      setFixError(
        error instanceof Error
          ? error.message
          : "Could not freeze the indexes. The old ones are still in place.",
      );
    } finally {
      setFixing(false);
    }
  }

  // Cards under one heading per start time. Confirmed provisional players get one clearly labelled
  // heading of their own instead of a made-up flight.
  const classOf = (g: { playerIds: string[]; flightId: string }) =>
    isUnclassifiedGroup(g.playerIds, regById) ? UNCLASSIFIED_LABEL : names.flight(g.flightId);
  // One tab per class, so a long day is read a class at a time instead of by scrolling.
  const classTabs = (() => {
    const tally = new Map<string, { groups: number; players: number }>();
    for (const g of sessionDraw ?? []) {
      const name = classOf(g);
      const row = tally.get(name) ?? { groups: 0, players: 0 };
      tally.set(name, { groups: row.groups + 1, players: row.players + g.playerIds.length });
    }
    return [...tally.entries()]
      .sort(([a], [b]) =>
        a === UNCLASSIFIED_LABEL ? 1 : b === UNCLASSIFIED_LABEL ? -1 : a.localeCompare(b),
      )
      .map(([name, row]) => ({ name, ...row }));
  })();
  const activeClass = classTabs.some((c) => c.name === classFilter) ? classFilter : "all";
  const shownGroups = (sessionDraw ?? []).filter(
    (g) => activeClass === "all" || classOf(g) === activeClass,
  );
  const sections = buildPairingSections({
    groups: shownGroups,
    categorization,
    classNameOf: classOf,
    flightOf,
  });

  const activeName = active ? playerById.get(active.id)?.name : null;
  const groupSize = config?.groupSize ?? 4;
  // The index edit is opened from a player row, so it reads that player's cut-off records only while
  // it is open.
  const indexPlayerRecord = indexPlayer ? (playerById.get(indexPlayer) ?? null) : null;
  const indexRegistration = indexPlayer ? (regById.get(indexPlayer) ?? null) : null;
  const indexEntry = indexPlayer ? (entryByPlayer.get(indexPlayer) ?? null) : null;
  const indexRecords = indexPlayer ? adapters.players.recordsFor(indexPlayer) : [];
  // The other half of the pair, so an index edit classes both partners together.
  const indexPartnerEntry = indexEntry ? partnerOf(indexEntry, entries) : null;
  const indexPartnerReg = indexPartnerEntry
    ? (regById.get(indexPartnerEntry.playerId) ?? null)
    : null;
  const openSpots =
    visibleDraw?.reduce((n, g) => n + Math.max(groupSize - g.playerIds.length, 0), 0) ?? 0;
  const lockedCount = visibleDraw?.filter((g) => g.locked).length ?? 0;
  const manualOverrideIds = new Set(
    overrides.filter((o) => o.kind === "move" && o.playerId).map((o) => o.playerId),
  );
  const checkedIds = useMemo(
    () => new Set(swapSel ? [...swapSel.base, ...swapSel.picks] : checked),
    [checked, swapSel],
  );
  // The command box and the set bars read the day's own board, not the class or session filter on
  // screen, so a filtered view never hides a name from the desk.
  const boardGroups = useMemo(() => visibleDraw ?? [], [visibleDraw]);
  const commandPlayers = useMemo(
    () =>
      boardGroups.flatMap((g) =>
        g.playerIds.map((id) => ({ id, name: playerById.get(id)?.name ?? "Unknown player" })),
      ),
    [boardGroups, playerById],
  );
  const commandGroups = useMemo(
    () => boardGroups.map((g) => ({ number: g.number, startHole: g.startHole })),
    [boardGroups],
  );
  const groupsByNumber = useMemo(
    () => [...boardGroups].sort((a, b) => a.number - b.number),
    [boardGroups],
  );

  if (!tournament || !config) return <NeedsTournament what="The draw" />;

  return (
    <div className="stack">
      <header className="row between">
        <div className="stack tight">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
              <li>
                <Link href="/tournaments" className="text-ink-muted no-underline hover:underline">
                  {tournament.name}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">Draw &amp; pairings</li>
            </ol>
          </nav>
          <p className="overline">Draw &amp; pairings</p>
          <h1>{shotgun ? "Shotgun draw" : "Two-tee draw"}</h1>
          <p className="muted">
            {tournament.name} · {chosenDay ? `${chosenDay.label} · ` : ""}
            {new Date(`${chosenDay?.playDate ?? config.date}T00:00:00`).toLocaleDateString(
              "en-PH",
              {
                dateStyle: "long",
              },
            )}{" "}
            · {shotgun ? "Shotgun start" : "Two-tee start"}
          </p>
          <div className="row" aria-live="polite">
            {!draw && <span className="pill info">No draw yet</span>}
            {draw && !isPublished && (
              <>
                <span className="pill info">Draft</span>
                <span className="hint">Players cannot see it yet.</span>
              </>
            )}
            {draw && isPublished && !changedSincePublish && (
              <>
                <span className="pill ok">Published</span>
                <span className="hint">
                  {desk.published &&
                    new Date(desk.published.at).toLocaleTimeString("en-PH", {
                      timeStyle: "short",
                    })}
                </span>
              </>
            )}
            {draw && isPublished && changedSincePublish && (
              <>
                <span className="pill warn">Published, with changes not yet published</span>
                <span className="hint">Players still see the earlier list.</span>
              </>
            )}
            {lockedCount > 0 && <span className="pill gold">{lockedCount} locked</span>}
          </div>
        </div>
        <div className="row">
          {!draw && (
            <button
              type="button"
              className="btn gold"
              data-help="draw-run"
              disabled={ready === 0}
              onClick={() => makeDraw(true)}
            >
              Make the draw
            </button>
          )}
          {draw && (
            <>
              {/* Cosmetic only: the real gate is RLS on tournaments and the server actions. */}
              <RoleGate
                role={member?.role}
                allow={["owner", "organizer"]}
                mode="disable"
                disabledReason="Only the owner or an organizer can publish, unpublish or start the draw over."
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  className={`btn${isPublished && !changedSincePublish ? " ghost" : " gold"}`}
                  data-help="draw-publish"
                  onClick={() => setPubOpen(true)}
                >
                  {isPublished
                    ? changedSincePublish
                      ? "Review and publish changes"
                      : "View published list"
                    : "Review and publish"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setConfirm("startOver")}>
                  Start over
                </button>
                {isPublished && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setConfirm("unpublish")}
                  >
                    Unpublish
                  </button>
                )}
              </RoleGate>
              <Link className="btn ghost" href="/print">
                Print center
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Live mode and undo for the last board change: the live event's own controls. */}
      <LiveModeBar />

      {draw && (
        <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 !py-3">
          <label className="field !gap-1">
            <span className="overline !text-[10px]">Override reason for the next move or lock</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="!w-auto max-w-full text-[16px] md:text-sm"
            >
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {playingDays.length > 0 && (
            <label className="field !gap-1">
              <span className="overline !text-[10px]">Day of the event</span>
              <select
                value={day ?? ""}
                onChange={(e) => setDay(e.target.value === "" ? null : Number(e.target.value))}
                className="!w-auto max-w-full text-[16px] md:text-sm"
                data-help="draw-day"
              >
                {playingDays.map((d) => (
                  <option key={d.id} value={d.dayNumber}>
                    {d.label} · {fmtIso(d.playDate)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {day !== null && (
            <RoleGate role={member?.role} allow={["owner", "organizer"]} mode="hide">
              <PairingSheetImport
                dayName={
                  chosenDay ? `${chosenDay.label} · ${fmtIso(chosenDay.playDate)}` : `Day ${day}`
                }
                candidates={pairingCandidates}
                currentGroups={draw ?? []}
                flightOf={(id) => regById.get(id)?.flightId ?? null}
                fallbackFlightId={tournament?.flights?.[0]?.id ?? null}
                maxGroupSize={config.groupSize}
                onApply={(groups) =>
                  dispatch({ type: "replaceDraw", draw: groups, dayNumber: day })
                }
              />
            </RoleGate>
          )}
          <button
            type="button"
            className="btn ghost"
            data-help="draw-run"
            onClick={() => makeDraw(true)}
          >
            Re-run proposal (keeps locks)
          </button>
          <span className="hint">
            A re-run keeps every locked group exactly where it is and re-proposes the rest. It does
            not take the published list down.
          </span>
          {day !== null && (
            <p className="hint w-full">
              Showing {chosenDay?.label ?? "one day"} only: {visibleDraw?.length ?? 0} group
              {(visibleDraw?.length ?? 0) === 1 ? "" : "s"}, {readyOnDay} ready player
              {readyOnDay === 1 ? "" : "s"}. This day's own board is loaded, and a save writes that
              day's round, so the other playing days stay exactly as they are.
              {mixedGroups.length > 0 &&
                ` ${mixedGroups.length} group${mixedGroups.length === 1 ? "" : "s"} also hold players from another day.`}
            </p>
          )}
        </div>
      )}

      {confirm === "startOver" && (
        <div className="notice warn" role="alert">
          <b>Start over?</b> This throws away every manual move, every override and every lock, and
          builds a fresh draw{isPublished ? ", and takes the published list down" : ""}.
          <div className="row" style={{ marginTop: ".6rem" }}>
            <button type="button" className="btn small" onClick={() => makeDraw(false)}>
              Yes, start over
            </button>
            <button type="button" className="btn small ghost" onClick={() => setConfirm(null)}>
              Keep current draw
            </button>
          </div>
        </div>
      )}
      {confirm === "unpublish" && (
        <div className="notice warn" role="alert">
          <b>Take the pairings down?</b> Players will see “not out yet” until you publish again.
          <div className="row" style={{ marginTop: ".6rem" }}>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                dispatch({ type: "unpublish" });
                setConfirm(null);
              }}
            >
              Yes, unpublish
            </button>
            <button type="button" className="btn small ghost" onClick={() => setConfirm(null)}>
              Keep published
            </button>
          </div>
        </div>
      )}

      {!draw && (
        <div className="card stack tight">
          <h2>No draw yet</h2>
          <p>
            The draw puts each ready player in a flight, groups them by handicap, and gives each
            group a starting hole and time. You can move anyone afterwards. Players marked Needs
            review or Not eligible are left out, and anyone over the index limit is blocked. A
            confirmed player who is still missing a birthdate, gender or handicap index is placed in
            an “Unclassified” group so they can play today.
          </p>
        </div>
      )}

      {draw && (
        <>
          {provisionalOffBoard.length > 0 && (
            <div className="notice warn" role="alert">
              <b>
                {provisionalOffBoard.length} confirmed provisional player
                {provisionalOffBoard.length === 1 ? " is" : "s are"} not on the board.
              </b>{" "}
              The draw was made before they were confirmed. Re-run the proposal to place them under
              “Unclassified”; the button is above the board.
            </div>
          )}
          {provisionalCount > 0 && (
            <div className="notice warn" role="status">
              <b>
                {provisionalCount} confirmed player{provisionalCount === 1 ? " is" : "s are"}{" "}
                provisional.
              </b>{" "}
              {missingSummary}. They are grouped under “Unclassified” so they can play today.
              Correct the player records (and re-freeze an index where needed) tomorrow, then re-run
              the draw; the label goes away once the data is complete.
            </div>
          )}
          <section className="tiles" aria-label="Draw readiness">
            <div className="tile">
              <b className="mono">
                {placed}/{readyOnDay}
              </b>
              <span>Ready players in a group</span>
            </div>
            <div className="tile">
              <b className="mono">{visibleDraw?.length ?? 0}</b>
              <span>Groups{lockedCount ? ` (${lockedCount} locked)` : ""}</span>
            </div>
            {provisionalCount > 0 && (
              <div className="tile warn">
                <b className="mono">{provisionalCount}</b>
                <span>Provisional</span>
              </div>
            )}
            <div className="tile">
              <b className="mono">{openSpots}</b>
              <span>Open spots</span>
            </div>
            <div className={`tile${blockingCount ? " bad" : ""}`}>
              <b className="mono">{blockingCount}</b>
              <span>Must fix</span>
            </div>
            <div className={`tile${warningCount ? " warn" : ""}`}>
              <b className="mono">{warningCount}</b>
              <span>To check</span>
            </div>
          </section>

          <nav className="row" aria-label="Draw view">
            <button
              type="button"
              className={view === "board" ? "btn small" : "btn small ghost"}
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
            >
              Groups{visibleDraw ? ` · ${visibleDraw.length}` : ""}
            </button>
            {shotgun && (
              <button
                type="button"
                className={view === "queue" ? "btn small" : "btn small ghost"}
                aria-pressed={view === "queue"}
                onClick={() => setView("queue")}
              >
                Flight queue
              </button>
            )}
            <button
              type="button"
              className={view === "checks" ? "btn small" : "btn small ghost"}
              aria-pressed={view === "checks"}
              onClick={() => setView("checks")}
            >
              Checks
              {blockingCount || warningCount
                ? ` · ${blockingCount} must fix · ${warningCount} to check`
                : ""}
            </button>
          </nav>

          {sessionTally.length > 0 && view !== "checks" && (
            <nav className="row" aria-label="Session">
              <button
                type="button"
                className={activeSession === "all" ? "btn small" : "btn small ghost"}
                aria-pressed={activeSession === "all"}
                onClick={() => setSessionFilter("all")}
              >
                AM and PM · {visibleDraw?.length ?? 0}
              </button>
              {sessionTally.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className={activeSession === row.key ? "btn small" : "btn small ghost"}
                  aria-pressed={activeSession === row.key}
                  onClick={() => setSessionFilter(row.key)}
                  title={`${row.groups} groups · ${row.players} players`}
                >
                  {row.key} · {row.groups}
                  <span className="muted"> ({row.players})</span>
                </button>
              ))}
            </nav>
          )}

          {view === "board" && (
            <div className="row">
              <nav className="row" aria-label="Categorization">
                <button
                  type="button"
                  className={categorization === "flight" ? "btn small" : "btn small ghost"}
                  aria-pressed={categorization === "flight"}
                  onClick={() => setCategorization("flight")}
                >
                  Flight priority
                </button>
                <button
                  type="button"
                  className={categorization === "class" ? "btn small" : "btn small ghost"}
                  aria-pressed={categorization === "class"}
                  onClick={() => setCategorization("class")}
                >
                  Class priority
                </button>
              </nav>
              <span className="hint">
                {categorization === "flight"
                  ? "Flight A, B, C in start order; holes run in order; class stays on each card."
                  : "Class first, as before. The flight order stays on each card."}
              </span>
            </div>
          )}

          {view === "board" && classTabs.length > 0 && (
            <div className="row">
              <nav className="row grow" aria-label="Class">
                <button
                  type="button"
                  className={activeClass === "all" ? "btn small" : "btn small ghost"}
                  aria-pressed={activeClass === "all"}
                  onClick={() => setClassFilter("all")}
                >
                  All classes · {visibleDraw?.length ?? 0}
                </button>
                {classTabs.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className={activeClass === c.name ? "btn small" : "btn small ghost"}
                    aria-pressed={activeClass === c.name}
                    onClick={() => setClassFilter(c.name)}
                    title={`${c.groups} groups · ${c.players} players`}
                  >
                    {c.name} · {c.groups}
                    <span className="muted"> ({c.players})</span>
                  </button>
                ))}
              </nav>
              <nav className="row" aria-label="Layout">
                <button
                  type="button"
                  className={layout === "cards" ? "btn small" : "btn small ghost"}
                  aria-pressed={layout === "cards"}
                  onClick={() => setLayout("cards")}
                >
                  Cards
                </button>
                <button
                  type="button"
                  className={layout === "table" ? "btn small" : "btn small ghost"}
                  aria-pressed={layout === "table"}
                  onClick={() => setLayout("table")}
                >
                  Table
                </button>
              </nav>
            </div>
          )}

          {view === "queue" && shotgun && (
            <div>
              <p className="hint mb-2">
                Moves and swaps lock the groups they touch, so a new draw keeps them. The reason
                chosen above is recorded with each change.
              </p>
              <FlightQueuePanel
                model={queueModel}
                holeOptions={holeOptions}
                onMoveToHole={onQueueMove}
                onSwap={onQueueSwap}
                onReorder={onQueueReorder}
              />
            </div>
          )}

          {view === "checks" && (
            <div data-help="draw-issues">
              {fixError && (
                <p className="notice bad" role="alert">
                  {fixError}
                </p>
              )}
              <IssuesPanel
                issues={panelIssues}
                busy={fixing}
                onFix={(action) => void fixCause(action)}
                onShow={(issue) => {
                  setView("board");
                  onShowIssue(issue);
                }}
              />
            </div>
          )}
        </>
      )}

      {/* Pick-and-place only. A banner appearing mid-drag would push the board out from under the cursor. */}
      {active?.via === "pick" && (
        <div className="moving" role="status">
          <span>
            Moving <b>{activeName}</b>. Choose a group below. Press Escape to cancel.
          </span>
          <button type="button" className="btn small" onClick={() => setActive(null)}>
            Cancel
          </button>
        </div>
      )}

      {draw && view === "board" && (
        <>
          {/* What the last drop did, in one line, with the undo that already exists. */}
          {dropNote && (
            <div
              className={`moving${dropNote.tone === "bad" ? " bad" : ""}`}
              role="status"
              data-testid="drop-confirm"
            >
              <span>{dropNote.text}</span>
              <span className="row">
                {dropNote.tone === "ok" && canUndo && (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      undoLastChange();
                      setDropNote(null);
                    }}
                  >
                    Undo
                  </button>
                )}
                <button type="button" className="btn small" onClick={() => setDropNote(null)}>
                  Dismiss
                </button>
              </span>
            </div>
          )}

          {/* A drop that could take the registered pair as well, waiting for one small choice. */}
          {pairAsk && (
            <div
              className="card flex flex-wrap items-center gap-x-4 gap-y-2 !py-3"
              role="status"
              data-testid="pair-choice"
            >
              <span className="text-[13px]">
                <b>{nameOf(pairAsk.playerId)}</b> and <b>{nameOf(pairAsk.partnerId)}</b> are a pair,
                and group {pairAsk.toGroup} has room for both.
              </span>
              <button type="button" className="btn" onClick={() => takePairChoice("one")}>
                Just {nameOf(pairAsk.playerId).split(",")[0]}
              </button>
              <button type="button" className="btn gold" onClick={() => takePairChoice("both")}>
                Move the pair
              </button>
              <button type="button" className="btn ghost" onClick={() => setPairAsk(null)}>
                Cancel
              </button>
            </div>
          )}

          <BoardCommandBar
            players={commandPlayers}
            groups={commandGroups}
            onSwapPlayers={runSwap}
            onSwapSets={(setA, setB) => dispatch({ type: "swapSets", setA, setB, reason })}
            onMove={(playerIds, toGroup) =>
              dispatch({ type: "moveSet", playerIds, toGroup, reason })
            }
          />

          {checked.length > 0 && !swapSel && (
            <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 !py-3" role="status">
              <span className="text-[13px]">
                <b>
                  {checked.length} player{checked.length === 1 ? "" : "s"} selected:
                </b>{" "}
                {checked.map((id) => nameOf(id)).join(", ")}
              </span>
              <label className="field !gap-1">
                <span className="overline !text-[10px]">Move {checked.length} to group…</span>
                <select
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                  className="!w-auto max-w-full text-[16px] md:text-sm"
                >
                  <option value="">Choose a group</option>
                  {groupsByNumber.map((g) => (
                    <option key={g.number} value={g.number}>
                      Group {g.number} · {g.playerIds.length} of {groupSize}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn"
                disabled={moveTarget === ""}
                onClick={() => moveChecked(Number(moveTarget))}
              >
                Move {checked.length} to group {moveTarget === "" ? "…" : moveTarget}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setSwapSel({ base: checked, picks: [] })}
              >
                Swap these {checked.length} with those {checked.length}
              </button>
              <button type="button" className="btn ghost" onClick={clearSelection}>
                Clear
              </button>
            </div>
          )}

          {swapSel && (
            <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 !py-3" role="status">
              <span className="text-[13px]">
                <b>Swapping {swapSel.base.map((id) => nameOf(id)).join(", ")}</b> · tick{" "}
                {swapSel.base.length} player{swapSel.base.length === 1 ? "" : "s"} to swap them with
                ({swapSel.picks.length} of {swapSel.base.length} ticked)
              </span>
              <button
                type="button"
                className="btn"
                disabled={swapSel.picks.length !== swapSel.base.length}
                onClick={swapChecked}
              >
                Swap them
              </button>
              <button type="button" className="btn ghost" onClick={() => setSwapSel(null)}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      {draw && day !== null && (visibleDraw?.length ?? 0) === 0 && (
        <div className="notice" role="status">
          No group holds a player who chose {chosenDay?.label ?? "this day"} yet. Choose another
          day, or “All playing days” to see the whole draw.
        </div>
      )}

      {draw && view === "board" && (
        <p className="hint" data-help="draw-drag">
          Drag a player onto another player to swap them, even between two full groups, or onto a
          group with room to move them there. Dropping on a full group offers a swap; a locked group
          says why it cannot take one. On a phone, drag from the ⋮⋮ handle. The Swap and Move
          buttons and the command box do the same things.
        </p>
      )}

      {draw && view === "board" && (
        <div className="draw-layout">
          <div className="board stack">
            {layout === "table" ? (
              <DrawTable
                sections={buildDrawTable({
                  groups: shownGroups,
                  startFormat: shotgun ? "shotgun" : "two_tee",
                  playerName: (id) => playerById.get(id)?.name ?? "Unknown player",
                  flightName: (id) => names.flight(id ?? ""),
                  isUnclassified: (g) => isUnclassifiedGroup(g.playerIds, regById),
                  categorization,
                  flightOf,
                })}
                issuesByGroup={issuesByGroup}
                selectedPlayer={selection?.kind === "player" ? selection.id : null}
                selectedGroup={selection?.kind === "group" ? selection.n : null}
                manualOverrideIds={manualOverrideIds as ReadonlySet<string>}
                onSelectPlayer={selectPlayer}
                onSelectGroup={selectGroup}
                active={active}
                hover={hover}
                intentFor={intentFor}
                onHoverTarget={onHoverTarget}
                onDropTarget={onDropTarget}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onPointerDragStart={onPointerDragStart}
              />
            ) : (
              sections.map(({ key, heading, groups }) => (
                <section key={key} className="stack tight">
                  <div className="wave-head">
                    <div>
                      <h2>{heading}</h2>
                      {heading === UNCLASSIFIED_LABEL && (
                        <p className="hint">
                          Confirmed while the player record is short of a routing fact, so no
                          category or flight was invented. The entry keeps the index from the club
                          sheet; correct the records, then re-run the draw.
                        </p>
                      )}
                    </div>
                    <span className="muted">
                      {groups.length} groups · {groups.reduce((n, g) => n + g.playerIds.length, 0)}{" "}
                      players
                    </span>
                  </div>
                  <div className="groups">
                    {groups.map((g) => (
                      <GroupCard
                        key={g.number}
                        g={g}
                        shotgun={Boolean(shotgun)}
                        groupSize={config.groupSize}
                        minGroupSize={config.minGroupSize}
                        flightName={
                          isUnclassifiedGroup(g.playerIds, regById)
                            ? UNCLASSIFIED_LABEL
                            : names.flight(g.flightId)
                        }
                        flightNameOf={names.flight}
                        classMismatchOf={classMismatchOf}
                        classMismatchCount={classCountByGroup.get(g.number) ?? 0}
                        canEditIndex={canEditIndex}
                        onEditIndex={setIndexPlayer}
                        players={playerById}
                        regs={regById}
                        manualOverrideIds={manualOverrideIds}
                        issues={issuesByGroup.get(g.number) ?? none}
                        active={active}
                        hover={hover}
                        intentFor={intentFor}
                        onHoverTarget={onHoverTarget}
                        onDropTarget={onDropTarget}
                        onPointerDragStart={onPointerDragStart}
                        swapAsk={swapAsk === g.number}
                        selectedPlayer={
                          selection?.kind === "player" && g.playerIds.includes(selection.id)
                            ? selection.id
                            : null
                        }
                        selected={selection?.kind === "group" && selection.n === g.number}
                        flash={flash === g.number}
                        slot={slotByGroup.get(g.number)}
                        onSelectPlayer={selectPlayer}
                        onSelectGroup={selectGroup}
                        onPick={onPick}
                        onLock={(n) => {
                          const group = draw.find((x) => x.number === n);
                          dispatch({
                            type: "setGroupLocked",
                            group: n,
                            locked: !(group?.locked ?? false),
                            reason,
                          });
                        }}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onMoveHere={moveActiveTo}
                        checkedIds={checkedIds}
                        onToggleCheck={toggleCheck}
                        swapFrom={swapFrom}
                        swapFromName={swapFromName}
                        onSwapWith={onSwapWith}
                        pairOf={pairOf}
                        onSelectPair={selectSet}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
          <div ref={panelRef} className="panel-wrap">
            <SidePanel
              tab={tab}
              onTab={setTab}
              draw={visibleDraw ?? []}
              unplaced={unplaced.filter((r) => onDay(r.playerId))}
              players={playerById}
              regs={regById}
              names={names}
              shotgun={Boolean(shotgun)}
              selection={selection}
              activeId={active?.id ?? null}
              onPick={onPick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onShowPlayer={showPlayer}
              onShowGroup={focusGroup}
              onLock={onLock}
              holeOptions={holeOptions}
              slotOf={slotOf}
              onMoveGroupToHole={onQueueMove}
              onSwapGroups={onQueueSwap}
              explain={adapters.router.explain}
            />
          </div>
        </div>
      )}

      {overrides.length > 0 && (
        <details className="card">
          <summary className="flex min-h-8 cursor-pointer flex-wrap items-center gap-2">
            <b>Manual overrides this session</b>
            <span className="pill info">{overrides.length}</span>
            <span className="hint">Every hand change is recorded with its reason.</span>
          </summary>
          <ul className="plain mt-3 grid gap-1.5 text-[13px]">
            {overrides.map((o) => {
              const name = o.playerId ? playerById.get(o.playerId)?.name : null;
              return (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center gap-x-3 border-t border-line pt-1.5"
                >
                  <span className="mono">
                    {new Date(o.at).toLocaleTimeString("en-PH", { timeStyle: "short" })}
                  </span>
                  <b>
                    {name ??
                      (o.kind === "lock" ? `Group ${o.to} locked` : `Group ${o.to} unlocked`)}
                  </b>
                  <span className="hint">
                    {o.kind === "move"
                      ? `moved from group ${o.from ?? "pool"} to group ${o.to}`
                      : `${o.kind}ed group ${o.to}`}
                    {" · "}
                    {o.reason}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* Phone thumb bar: the one action this screen is for, kept above the desk tab bar. */}
      <div className="no-print sticky bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-20 -mx-4 flex items-center gap-2 border-t border-line bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">
          {chosenDay ? `${chosenDay.label} · ${fmtIso(chosenDay.playDate)}` : "Draw & pairings"}
        </span>
        {!draw ? (
          <button
            type="button"
            className="btn gold"
            disabled={ready === 0}
            onClick={() => makeDraw(true)}
          >
            Make the draw
          </button>
        ) : (
          <RoleGate
            role={member?.role}
            allow={["owner", "organizer"]}
            mode="disable"
            disabledReason="Only the owner or an organizer can publish pairings."
          >
            <button type="button" className="btn gold" onClick={() => setPubOpen(true)}>
              {isPublished && !changedSincePublish ? "Published list" : "Review and publish"}
            </button>
          </RoleGate>
        )}
      </div>

      {indexPlayer && indexPlayerRecord && indexRegistration && indexEntry && (
        <PlayerIndexDialog
          key={indexPlayer}
          open
          onOpenChange={(open) => {
            if (!open) setIndexPlayer(null);
          }}
          player={indexPlayerRecord}
          entry={indexEntry}
          registration={indexRegistration}
          tournament={tournament}
          tees={tees}
          records={indexRecords}
          partnerEntry={indexPartnerEntry}
          partnerRegistration={indexPartnerReg}
          onSave={(input) => {
            // The adapter writes the entry, and the board reads the registrations again, so the row
            // and its class badge follow. The draw is not touched: the player stays in this group.
            void adapters.registrations.overrideReady(indexEntry.id, input);
            setIndexPlayer(null);
          }}
        />
      )}

      <PublishDialog open={pubOpen} issues={issues} onClose={() => setPubOpen(false)} />
    </div>
  );
}
