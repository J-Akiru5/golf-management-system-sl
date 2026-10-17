"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GroupCard } from "@/components/draw/GroupCard";
import { IssuesPanel } from "@/components/draw/IssuesPanel";
import { PublishDialog } from "@/components/draw/PublishDialog";
import { type Selection, SidePanel, type Tab } from "@/components/draw/SidePanel";
import { dropCheck, type Issue, validateDraw } from "@/lib/draw/validate";
import { fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";

export default function DrawPage() {
  const {
    state,
    registrations,
    regById,
    unplaced,
    playerById,
    names,
    dispatch,
    isPublished,
    changedSincePublish,
  } = useDesk();
  const { draw, config } = state;

  const [active, setActive] = useState<{ id: string; via: "pick" | "drag" } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("pool");
  const [flash, setFlash] = useState<number | null>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const [confirm, setConfirm] = useState<"redo" | "unpublish" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const shotgun = config.startFormat === "shotgun";
  const ready = registrations.filter((r) => r.status === "ok").length;
  const placed = draw?.reduce((n, g) => n + g.playerIds.length, 0) ?? 0;

  const issues = useMemo(
    () =>
      draw
        ? validateDraw({
            draw,
            registrations,
            config,
            engineWarnings: state.drawWarnings,
            names,
          })
        : [],
    [draw, registrations, config, state.drawWarnings, names],
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
      const g = state.draw?.find((x) => x.playerIds.includes(id));
      if (g) focusGroup(g.number);
    },
    [selectPlayer, focusGroup, state.draw],
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
      if (!id || !state.draw) return false;
      return dropCheck(state.draw, state.config, regById, id, n, names).ok;
    },
    [state.draw, state.config, regById, names],
  );
  const dropOn = useCallback(
    (n: number) => {
      const id = dragId.current;
      if (!id || !allowDrop(n)) return;
      dispatch({ type: "move", playerId: id, toGroup: n });
      setSelection({ kind: "player", id });
      dragId.current = null;
      setActive(null);
    },
    [allowDrop, dispatch],
  );
  const onLock = useCallback((n: number) => dispatch({ type: "lock", group: n }), [dispatch]);

  const moveActiveTo = useCallback(
    (n: number) => {
      if (!active) return;
      dispatch({ type: "move", playerId: active.id, toGroup: n });
      setSelection({ kind: "player", id: active.id });
      setActive(null);
    },
    [active, dispatch],
  );

  function generate() {
    dispatch({ type: "generate" });
    setConfirm(null);
    setActive(null);
    setSelection(null);
  }

  // Cards under one heading per wave (shotgun) or per start time (two-tee).
  const sections = new Map<string, NonNullable<typeof draw>>();
  for (const g of draw ?? []) {
    const key = shotgun ? `Wave ${g.wave} · ${fmtTime(g.time)}` : fmtTime(g.time);
    sections.set(key, [...(sections.get(key) ?? []), g]);
  }

  const activeName = active ? playerById.get(active.id)?.name : null;
  const openSpots = draw ? draw.length * config.groupSize - placed : 0;
  const lockedCount = draw?.filter((g) => g.locked).length ?? 0;

  return (
    <div className="stack">
      <header className="row between">
        <div className="stack tight">
          <h1>Draw</h1>
          <p className="muted">
            {state.name} ·{" "}
            {new Date(`${config.date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" })}{" "}
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
                  {state.published &&
                    new Date(state.published.at).toLocaleTimeString("en-PH", {
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
          </div>
        </div>
        <div className="row">
          {!draw && (
            <button type="button" className="btn gold" disabled={ready === 0} onClick={generate}>
              Make the draw
            </button>
          )}
          {draw && (
            <>
              <button
                type="button"
                className={`btn${isPublished && !changedSincePublish ? " ghost" : " gold"}`}
                onClick={() => setPubOpen(true)}
              >
                {isPublished
                  ? changedSincePublish
                    ? "Review and publish changes"
                    : "View published list"
                  : "Review and publish"}
              </button>
              {isPublished && (
                <Link className="btn ghost" href="/pairings">
                  Player view
                </Link>
              )}
              {isPublished && (
                <button type="button" className="btn ghost" onClick={() => setConfirm("unpublish")}>
                  Unpublish
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => setConfirm("redo")}>
                Start over
              </button>
            </>
          )}
        </div>
      </header>

      {confirm === "redo" && (
        <div className="notice warn" role="alert">
          <b>Start over?</b> This throws away every manual move and lock, builds a fresh draw
          {isPublished ? ", and takes the published list down" : ""}.
          <div className="row" style={{ marginTop: ".6rem" }}>
            <button type="button" className="btn small" onClick={generate}>
              Yes, make a new draw
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
            The draw puts players in their flight, groups them by handicap, and gives each group a
            starting hole and time. You can move anyone afterwards. Players marked Needs review or
            Not eligible are left out.
          </p>
        </div>
      )}

      {draw && (
        <>
          <section className="tiles" aria-label="Draw readiness">
            <div className="tile">
              <b className="mono">
                {placed}/{ready}
              </b>
              <span>Ready players in a group</span>
            </div>
            <div className="tile">
              <b className="mono">{draw.length}</b>
              <span>Groups{lockedCount ? ` (${lockedCount} locked)` : ""}</span>
            </div>
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

          <IssuesPanel issues={issues} onShow={onShowIssue} />
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

      {draw && (
        <div className="draw-layout">
          <div className="board stack">
            {[...sections.entries()].map(([heading, groups]) => (
              <section key={heading} className="stack tight">
                <div className="wave-head">
                  <h2>{heading}</h2>
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
                      shotgun={shotgun}
                      groupSize={config.groupSize}
                      minGroupSize={config.minGroupSize}
                      flightName={names.flight(g.flightId)}
                      players={playerById}
                      regs={regById}
                      issues={issuesByGroup.get(g.number) ?? none}
                      active={active}
                      drop={
                        active ? dropCheck(draw, config, regById, active.id, g.number, names) : null
                      }
                      selectedPlayer={
                        selection?.kind === "player" && g.playerIds.includes(selection.id)
                          ? selection.id
                          : null
                      }
                      selected={selection?.kind === "group" && selection.n === g.number}
                      flash={flash === g.number}
                      onSelectPlayer={selectPlayer}
                      onSelectGroup={selectGroup}
                      onPick={onPick}
                      onLock={onLock}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onMoveHere={moveActiveTo}
                      allowDrop={allowDrop}
                      dropOn={dropOn}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div ref={panelRef} className="panel-wrap">
            <SidePanel
              tab={tab}
              onTab={setTab}
              draw={draw}
              unplaced={unplaced}
              players={playerById}
              regs={regById}
              names={names}
              shotgun={shotgun}
              selection={selection}
              activeId={active?.id ?? null}
              onPick={onPick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onShowPlayer={showPlayer}
              onShowGroup={focusGroup}
              onLock={onLock}
            />
          </div>
        </div>
      )}

      <PublishDialog open={pubOpen} issues={issues} onClose={() => setPubOpen(false)} />
    </div>
  );
}
