"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoleGate } from "@/components/desk";
import { DrawTable } from "@/components/draw/DrawTable";
import { FlightQueuePanel } from "@/components/draw/FlightQueuePanel";
import { GroupCard } from "@/components/draw/GroupCard";
import { IssuesPanel } from "@/components/draw/IssuesPanel";
import { PublishDialog } from "@/components/draw/PublishDialog";

import { type Selection, SidePanel, type Tab } from "@/components/draw/SidePanel";
import { NeedsTournament } from "@/components/NeedsTournament";
import { fmtIso } from "@/lib/data/labels";
import { sessionFinderFor } from "@/lib/draw/day-sessions";
import { buildFlightQueue } from "@/lib/draw/flight-queue";
import { buildDrawTable } from "@/lib/draw/table-model";
import { dropCheck, type Issue, validateDraw } from "@/lib/draw/validate";
import { fmtTime } from "@/lib/format";
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
    entries,
    days,
    drawDay,
    setDrawDay,
  } = desk;
  const draw = desk.draw;
  const config = tournament?.config ?? null;

  const [active, setActive] = useState<{ id: string; via: "pick" | "drag" } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("pool");
  // The check list is long, so it lives on its own tab and the groups are visible on opening.
  const [view, setView] = useState<"board" | "checks" | "queue">("board");
  // AM, PM or both. Every playing day runs a morning and an afternoon session.
  const [sessionFilter, setSessionFilter] = useState<"all" | "AM" | "PM">("all");
  const [classFilter, setClassFilter] = useState("all");
  // Cards edit; the table is the printed pairing layout, for reading a class at a glance.
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  const [flash, setFlash] = useState<number | null>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const [confirm, setConfirm] = useState<"startOver" | "unpublish" | null>(null);
  const [reason, setReason] = useState(REASONS[0] as string);
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

  // Escape drops whatever is picked up.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

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
  const onDragStart = useCallback((id: string) => {
    dragId.current = id;
    // Changing the page inside dragstart can cancel the drag in Chrome, so wait a tick.
    setTimeout(() => setActive({ id, via: "drag" }), 0);
  }, []);
  const onDragEnd = useCallback(() => {
    dragId.current = null;
    setActive(null);
  }, []);
  const allowDrop = useCallback(
    (n: number) => {
      const id = dragId.current;
      if (!id || !draw || !config) return false;
      return dropCheck(draw, config, regById, id, n, names).ok;
    },
    [draw, config, regById, names],
  );
  const dropOn = useCallback(
    (n: number) => {
      const id = dragId.current;
      if (!id || !allowDrop(n)) return;
      dispatch({ type: "move", playerId: id, toGroup: n, reason });
      setSelection({ kind: "player", id });
      dragId.current = null;
      setActive(null);
    },
    [allowDrop, dispatch, reason],
  );
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
  const sections = new Map<string, NonNullable<typeof draw>>();
  for (const g of shownGroups) {
    const key = isUnclassifiedGroup(g.playerIds, regById)
      ? UNCLASSIFIED_LABEL
      : `${fmtTime(g.time)} · ${names.flight(g.flightId)}`;
    sections.set(key, [...(sections.get(key) ?? []), g]);
  }

  const activeName = active ? playerById.get(active.id)?.name : null;
  const groupSize = config?.groupSize ?? 4;
  const openSpots =
    visibleDraw?.reduce((n, g) => n + Math.max(groupSize - g.playerIds.length, 0), 0) ?? 0;
  const lockedCount = visibleDraw?.filter((g) => g.locked).length ?? 0;
  const manualOverrideIds = new Set(
    overrides.filter((o) => o.kind === "move" && o.playerId).map((o) => o.playerId),
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
                disabledReason="Only the owner or an organizer can publish pairings."
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
              </RoleGate>
              <button type="button" className="btn ghost" onClick={() => setConfirm("startOver")}>
                Start over
              </button>
              <Link className="btn ghost" href="/print">
                Print center
              </Link>
              {isPublished && (
                <button type="button" className="btn ghost" onClick={() => setConfirm("unpublish")}>
                  Unpublish
                </button>
              )}
            </>
          )}
        </div>
      </header>

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
                issues={issues}
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

      {draw && day !== null && (visibleDraw?.length ?? 0) === 0 && (
        <div className="notice" role="status">
          No group holds a player who chose {chosenDay?.label ?? "this day"} yet. Choose another
          day, or “All playing days” to see the whole draw.
        </div>
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
                })}
                issuesByGroup={issuesByGroup}
                selectedPlayer={selection?.kind === "player" ? selection.id : null}
                selectedGroup={selection?.kind === "group" ? selection.n : null}
                manualOverrideIds={manualOverrideIds as ReadonlySet<string>}
                onSelectPlayer={selectPlayer}
                onSelectGroup={selectGroup}
              />
            ) : (
              [...sections.entries()].map(([heading, groups]) => (
                <section key={heading} className="stack tight">
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
                        players={playerById}
                        regs={regById}
                        manualOverrideIds={manualOverrideIds}
                        issues={issuesByGroup.get(g.number) ?? none}
                        active={active}
                        drop={
                          active
                            ? dropCheck(draw, config, regById, active.id, g.number, names)
                            : null
                        }
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
                        allowDrop={allowDrop}
                        dropOn={dropOn}
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

      <PublishDialog open={pubOpen} issues={issues} onClose={() => setPubOpen(false)} />
    </div>
  );
}
