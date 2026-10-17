"use client";

import { useState } from "react";
import { Avatar } from "@/components/bits";
import { PlayerCard } from "@/components/PlayerCard";
import type { DeskPlayer } from "@/lib/demo/data";
import type { DrawGroup } from "@/lib/draw/validate";
import { fmtHcp, fmtTime, photoOf } from "@/lib/format";
import type { Registration } from "@/lib/routing";

export type Selection = { kind: "player"; id: string } | { kind: "group"; n: number } | null;
export type Tab = "pool" | "details";

interface Names {
  category: (id: string | null) => string;
  flight: (id: string | null) => string;
  tee: (id: string | null) => string;
}

export function SidePanel(props: {
  tab: Tab;
  onTab: (t: Tab) => void;
  draw: DrawGroup[];
  unplaced: Registration[];
  players: Map<string, DeskPlayer>;
  regs: Map<string, Registration>;
  names: Names;
  shotgun: boolean;
  selection: Selection;
  activeId: string | null;
  onPick: (id: string | null) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onShowPlayer: (id: string) => void;
  onShowGroup: (n: number) => void;
  onLock: (n: number) => void;
}) {
  const { tab, draw, unplaced, players, regs, names, selection } = props;
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const found = query
    ? [...players.values()]
        .filter((p) => p.name.toLowerCase().includes(query))
        .slice(0, 8)
        .map((p) => ({ p, group: draw.find((g) => g.playerIds.includes(p.id)) }))
    : [];

  const groupLabel = (g: DrawGroup) =>
    `Group ${g.number} · ${props.shotgun ? "hole" : "tee"} ${g.startHole} · ${fmtTime(g.time)}`;

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
                Drag a player onto a group, or press Place and then choose one.
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
                          <span className="muted">{names.flight(r.flightId)}</span>
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
              return (
                <>
                  <PlayerCard player={pl} reg={r} names={names} />
                  <div className="card flat">
                    {g ? (
                      <p>
                        <b>{groupLabel(g)}</b>
                        <br />
                        <span className="muted">{names.flight(g.flightId)}</span>
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
                  </div>
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
                    {names.flight(g.flightId)} · {g.playerIds.length} players
                    {g.wave ? ` · Wave ${g.wave}` : ""}
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
                  <button
                    type="button"
                    className={`btn small ${g.locked ? "" : "ghost"}`}
                    onClick={() => props.onLock(g.number)}
                  >
                    {g.locked ? "Unlock group" : "Lock group"}
                  </button>
                </div>
              );
            })()}
        </div>
      )}
    </aside>
  );
}
