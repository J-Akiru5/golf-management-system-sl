"use client";

import { useState } from "react";
import { Avatar } from "@/components/bits";
import { PlayerCard } from "@/components/PlayerCard";
import type { RoutingExplanation } from "@/lib/data/explain";
import type { DeskRegistration, PlayerRecord } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import { fmtHcp, fmtTime, photoOf } from "@/lib/format";
import { matchesText } from "@/lib/names";
import { UNCLASSIFIED_LABEL } from "@/lib/routing";
import { cn } from "@/lib/ui/cn";

export type Selection = { kind: "player"; id: string } | { kind: "group"; n: number } | null;
export type Tab = "pool" | "details";

interface Names {
  category: (id: string | null) => string;
  flight: (id: string | null) => string;
  tee: (id: string | null) => string;
}

/**
 * Where one group starts, with the two ways to change it by hand: pick another hole, or swap the
 * whole start with another group. Moving onto a hole that another group has at the same time swaps
 * the two. Either way the groups end up locked, so a re-run of the draw keeps them.
 */
function StartHoleControl(props: {
  g: DrawGroup;
  draw: DrawGroup[];
  shotgun: boolean;
  holeOptions: number[];
  /** The hole with its flight letter for a group ("1A"), when the draw can say. */
  slotOf?: (groupNumber: number) => string | undefined;
  onMove: (groupNumber: number, hole: number) => void;
  onSwap: (a: number, b: number) => void;
}) {
  const { g, shotgun } = props;
  const word = shotgun ? "Start hole" : "Start tee";
  const place = (hole: number) => (shotgun ? `Hole ${hole}` : `Tee ${hole}`);
  // A start hole outside the usual list (an older board) still shows, so the select is never blank.
  const options = props.holeOptions.includes(g.startHole)
    ? props.holeOptions
    : [...props.holeOptions, g.startHole].sort((a, b) => a - b);
  const others = props.draw
    .filter((x) => x.number !== g.number)
    .sort((a, b) => a.number - b.number);
  return (
    <div className="stack tight">
      <label className="field">
        <span>{word}</span>
        <select
          value={g.startHole}
          onChange={(e) => {
            const hole = Number(e.currentTarget.value);
            if (Number.isInteger(hole) && hole !== g.startHole) props.onMove(g.number, hole);
          }}
        >
          {options.map((hole) => (
            <option key={hole} value={hole}>
              {place(hole)}
            </option>
          ))}
        </select>
      </label>
      {others.length > 0 && (
        <label className="field">
          <span>Swap start with</span>
          <select
            value=""
            onChange={(e) => {
              const other = Number(e.currentTarget.value);
              if (Number.isInteger(other) && other > 0) props.onSwap(g.number, other);
            }}
          >
            <option value="">Choose a group…</option>
            {others.map((o) => (
              <option key={o.number} value={o.number}>
                {`Group ${o.number} · ${shotgun ? `Hole ${props.slotOf?.(o.number) ?? o.startHole}` : place(o.startHole)} · ${fmtTime(o.time)}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="hint">
        Choosing a hole another group has at the same time swaps the two. Changed groups are locked,
        so a new draw keeps them.
      </p>
    </div>
  );
}

export function SidePanel(props: {
  tab: Tab;
  onTab: (t: Tab) => void;
  draw: DrawGroup[];
  unplaced: DeskRegistration[];
  players: Map<string, PlayerRecord>;
  regs: Map<string, DeskRegistration>;
  names: Names;
  shotgun: boolean;
  selection: Selection;
  activeId: string | null;
  onPick: (id: string | null) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onShowPlayer: (id: string) => void;
  onShowGroup: (n: number) => void;
  onLock: (n: number, locked: boolean) => void;
  /** The holes (or tees) a group can start on, in the order the list shows them. */
  holeOptions: number[];
  /** The hole with its flight letter for a group ("1A"), when the draw can say. */
  slotOf?: (groupNumber: number) => string | undefined;
  onMoveGroupToHole: (groupNumber: number, hole: number) => void;
  onSwapGroups: (a: number, b: number) => void;
  explain: (playerId: string) => RoutingExplanation | null;
}) {
  const { tab, draw, unplaced, players, regs, names, selection } = props;
  const [q, setQ] = useState("");
  const query = q.trim();
  const found = query
    ? [...players.values()]
        .filter((p) => matchesText(p.name, query))
        .slice(0, 8)
        .map((p) => ({ p, group: draw.find((g) => g.playerIds.includes(p.id)) }))
    : [];

  const groupLabel = (g: DrawGroup) =>
    `Group ${g.number} · ${props.shotgun ? "hole" : "tee"} ${
      props.shotgun ? (props.slotOf?.(g.number) ?? g.startHole) : g.startHole
    } · ${fmtTime(g.time)}`;

  // A group whose members are all provisional is labelled from them, not from the carrier flight
  // id the database row needs.
  const flightLabel = (g: DrawGroup) =>
    g.playerIds.length > 0 && g.playerIds.every((id) => regs.get(id)?.provisional === true)
      ? UNCLASSIFIED_LABEL
      : names.flight(g.flightId);

  return (
    <aside className="panel" aria-label="Player pool and details">
      <div className="tabs" role="tablist">
        {(
          [
            ["pool", `Player pool${unplaced.length ? ` (${unplaced.length})` : ""}`],
            ["details", "Details"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => props.onTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pool" && (
        <div role="tabpanel" id="panel-pool" aria-labelledby="tab-pool" className="stack tight">
          <h2 className="small-h">Not in a group</h2>
          {unplaced.length === 0 ? (
            <p className="muted">Every ready player is in a group.</p>
          ) : (
            <>
              <p className="hint">
                Drag a player onto a group, or press Place and then choose one. Moving a player is
                recorded as a manual override.
              </p>
              <ul className="plain">
                {unplaced.map((r) => {
                  const pl = players.get(r.playerId);
                  return (
                    <li key={r.playerId} className="slot pool">
                      <span
                        className="grip"
                        aria-hidden="true"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", r.playerId);
                          e.dataTransfer.effectAllowed = "move";
                          props.onDragStart(r.playerId);
                        }}
                        onDragEnd={props.onDragEnd}
                      >
                        ⋮⋮
                      </span>
                      <button
                        type="button"
                        className="who headbtn"
                        onClick={() => props.onShowPlayer(r.playerId)}
                      >
                        <Avatar name={r.playerName} photo={pl ? photoOf(pl) : undefined} />
                        <span>
                          {r.playerName}
                          <br />
                          <span className="muted">
                            {r.flightId
                              ? names.flight(r.flightId)
                              : r.provisional
                                ? UNCLASSIFIED_LABEL
                                : names.flight(null)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        aria-pressed={props.activeId === r.playerId}
                        onClick={() =>
                          props.onPick(props.activeId === r.playerId ? null : r.playerId)
                        }
                      >
                        {props.activeId === r.playerId ? "Picked" : "Place"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <h2 className="small-h">Find a player</h2>
          <input
            type="search"
            placeholder="Search by name"
            aria-label="Find a player on the board"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {query && found.length === 0 && <p className="muted">No one by that name.</p>}
          <ul className="plain">
            {found.map(({ p, group }) => (
              <li key={p.id} className="slot pool">
                <span>
                  {p.name}
                  <br />
                  <span className="muted">{group ? groupLabel(group) : "Not in a group"}</span>
                </span>
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => props.onShowPlayer(p.id)}
                >
                  Show
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "details" && (
        <div
          role="tabpanel"
          id="panel-details"
          aria-labelledby="tab-details"
          className="stack tight"
        >
          {!selection && (
            <p className="muted">
              Choose a player or a group on the board to see their details here. Nothing on the
              board moves when you do.
            </p>
          )}
          {selection?.kind === "player" &&
            (() => {
              const pl = players.get(selection.id);
              const r = regs.get(selection.id);
              if (!pl || !r) return <p className="muted">That player is no longer here.</p>;
              const g = draw.find((x) => x.playerIds.includes(pl.id));
              const explanation = props.explain(pl.id);
              return (
                <>
                  <PlayerCard player={pl} reg={r} names={names} />
                  {r.provisional && (
                    <p className="notice warn" role="status">
                      <b>Provisional.</b> Missing {r.missing.join(", ")}. The player is in an
                      Unclassified group so they can play today; correct it tomorrow and re-run the
                      draw.
                    </p>
                  )}
                  <div className="card flat">
                    {g ? (
                      <p>
                        <b>{groupLabel(g)}</b>
                        <br />
                        <span className="muted">{flightLabel(g)}</span>
                        {g.locked && <span className="pill gold gap">Locked</span>}
                      </p>
                    ) : (
                      <p>Not in a group yet.</p>
                    )}
                    <div className="row">
                      {g && (
                        <button
                          type="button"
                          className="btn small ghost"
                          onClick={() => props.onShowGroup(g.number)}
                        >
                          Show group
                        </button>
                      )}
                      {g?.locked ? (
                        <span className="hint">Unlock the group to move this player.</span>
                      ) : (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => props.onPick(props.activeId === pl.id ? null : pl.id)}
                        >
                          {props.activeId === pl.id ? "Picked" : "Move"}
                        </button>
                      )}
                    </div>
                    {g && (
                      <StartHoleControl
                        g={g}
                        draw={draw}
                        shotgun={props.shotgun}
                        holeOptions={props.holeOptions}
                        slotOf={props.slotOf}
                        onMove={props.onMoveGroupToHole}
                        onSwap={props.onSwapGroups}
                      />
                    )}
                  </div>
                  {explanation && (
                    <div className="card flat">
                      <h3 className="mb-2">Why they landed here</h3>
                      <ol className="plain grid gap-2">
                        {explanation.steps.map((s, i) => (
                          <li key={`${s.label}-${i}`} className="grid gap-0.5">
                            <span className="flex items-center gap-2 text-[13px] font-semibold">
                              <i
                                aria-hidden="true"
                                className={cn(
                                  "size-2 rounded-full",
                                  s.tone === "ok" && "bg-success",
                                  s.tone === "warn" && "bg-warning",
                                  s.tone === "bad" && "bg-danger",
                                  s.tone === "info" && "bg-info",
                                )}
                              />
                              {s.label}
                            </span>
                            <span className="hint">{s.detail}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              );
            })()}
          {selection?.kind === "group" &&
            (() => {
              const g = draw.find((x) => x.number === selection.n);
              if (!g) return <p className="muted">That group is no longer here.</p>;
              const hcps = g.playerIds
                .map((id) => regs.get(id)?.playingHandicap)
                .filter((h): h is number => typeof h === "number");
              const avg = hcps.length ? hcps.reduce((a, b) => a + b, 0) / hcps.length : null;
              return (
                <div className="card flat stack tight">
                  <h3>{groupLabel(g)}</h3>
                  <p className="muted">
                    {flightLabel(g)} · {g.playerIds.length} players
                  </p>
                  <dl className="facts">
                    <div>
                      <dt>Average playing handicap</dt>
                      <dd className="mono">{avg === null ? "—" : fmtHcp(Math.round(avg))}</dd>
                    </div>
                    <div>
                      <dt>Spread</dt>
                      <dd className="mono">
                        {hcps.length
                          ? `${fmtHcp(Math.min(...hcps))} to ${fmtHcp(Math.max(...hcps))}`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <StartHoleControl
                    g={g}
                    draw={draw}
                    shotgun={props.shotgun}
                    holeOptions={props.holeOptions}
                    slotOf={props.slotOf}
                    onMove={props.onMoveGroupToHole}
                    onSwap={props.onSwapGroups}
                  />
                  <button
                    type="button"
                    className={`btn small ${g.locked ? "" : "ghost"}`}
                    onClick={() => props.onLock(g.number, !g.locked)}
                  >
                    {g.locked ? "Unlock group" : "Lock group"}
                  </button>
                  <p className="hint">
                    Locked groups keep their players and their start when the draw is re-run.
                  </p>
                </div>
              );
            })()}
        </div>
      )}
    </aside>
  );
}
