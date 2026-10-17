"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/bits";
import { fmtHcp, fmtTime } from "@/lib/format";
import { type DrawGroup, useDesk } from "@/lib/store/desk-store";

export default function DrawPage() {
  const { state, registrations, regById, unplaced, playerById, names, dispatch } = useDesk();
  const [moving, setMoving] = useState<string | null>(null);
  const [confirmRedo, setConfirmRedo] = useState(false);
  const { draw, config } = state;

  const ready = registrations.filter((r) => r.status === "ok").length;
  const placed = draw?.reduce((n, g) => n + g.playerIds.length, 0) ?? 0;
  const shotgun = config.startFormat === "shotgun";

  // Group the cards under one heading per wave (shotgun) or per tee time (two-tee).
  const sections = new Map<string, DrawGroup[]>();
  for (const g of draw ?? []) {
    const key = shotgun ? `Wave ${g.wave} · ${fmtTime(g.time)}` : fmtTime(g.time);
    sections.set(key, [...(sections.get(key) ?? []), g]);
  }

  const movingName = moving ? playerById.get(moving)?.name : null;
  const sourceGroup = moving ? draw?.find((g) => g.playerIds.includes(moving)) : undefined;

  function generate() {
    dispatch({ type: "generate" });
    setConfirmRedo(false);
    setMoving(null);
  }

  return (
    <div className="stack">
      <header className="row between">
        <div>
          <h1>Draw</h1>
          <p className="muted">
            {draw
              ? `${placed} of ${ready} ready players placed in ${draw.length} groups.`
              : `${ready} players are ready to be placed.`}
          </p>
        </div>
        <div className="row">
          {!draw && (
            <button type="button" className="btn brass" disabled={ready === 0} onClick={generate}>
              Make the draw
            </button>
          )}
          {draw && !confirmRedo && (
            <button type="button" className="btn ghost" onClick={() => setConfirmRedo(true)}>
              Start over
            </button>
          )}
          {draw && (
            <button
              type="button"
              className={`btn${state.published ? " ghost" : " brass"}`}
              onClick={() => dispatch({ type: "publish", value: !state.published })}
            >
              {state.published ? "Unpublish" : "Publish pairings"}
            </button>
          )}
          {state.published && (
            <Link className="btn ghost" href="/pairings">
              See player view
            </Link>
          )}
        </div>
      </header>

      {confirmRedo && (
        <div className="notice warn" role="alert">
          <b>Start over?</b> This throws away every manual move and lock and builds a fresh draw.
          <div className="row" style={{ marginTop: ".6rem" }}>
            <button type="button" className="btn small" onClick={generate}>
              Yes, make a new draw
            </button>
            <button type="button" className="btn small ghost" onClick={() => setConfirmRedo(false)}>
              Keep current draw
            </button>
          </div>
        </div>
      )}

      {!draw && (
        <div className="card stack" style={{ gap: ".5rem" }}>
          <h2>No draw yet</h2>
          <p>
            The draw puts players in their flight, groups them by handicap, and gives each group a
            starting hole and time. You can move anyone afterwards. Players marked Needs review or
            Not eligible are left out.
          </p>
        </div>
      )}

      {state.drawWarnings.length > 0 && (
        <div className="notice warn">
          <b>Check these:</b>
          <ul>
            {state.drawWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {moving && (
        <div className="moving" role="status">
          <span>
            Moving <b>{movingName}</b>. Choose a group to move them to.
          </span>
          <button type="button" className="btn small" onClick={() => setMoving(null)}>
            Cancel
          </button>
        </div>
      )}

      {unplaced.length > 0 && (
        <section className="card stack" style={{ gap: ".6rem" }}>
          <h2>Not in the draw yet</h2>
          <p className="muted">
            Added after the draw was made. Pick a player, then pick a group with room.
          </p>
          {unplaced.map((r) => (
            <div key={r.playerId} className="row between">
              <span className="who">
                <Avatar name={r.playerName} photo={playerById.get(r.playerId)?.photo} />
                {r.playerName} <span className="muted">· {names.flight(r.flightId)}</span>
              </span>
              <button type="button" className="btn small" onClick={() => setMoving(r.playerId)}>
                Place
              </button>
            </div>
          ))}
        </section>
      )}

      {[...sections.entries()].map(([heading, groups]) => (
        <section key={heading} className="stack" style={{ gap: ".75rem" }}>
          <div className="wave-head">
            <h2>{heading}</h2>
            <span className="muted">{groups.length} groups</span>
          </div>
          <div className="groups">
            {groups.map((g) => {
              const full = g.playerIds.length >= config.groupSize;
              const canReceive =
                Boolean(moving) &&
                !g.locked &&
                !full &&
                sourceGroup?.number !== g.number &&
                !sourceGroup?.locked;
              return (
                <article
                  key={g.number}
                  className={`group${g.locked ? " locked" : ""}${canReceive ? " target" : ""}`}
                >
                  <div className="group-head">
                    <span className="who">
                      <span className="hole" aria-hidden="true">
                        {g.startHole}
                      </span>
                      <span>
                        <b>{shotgun ? `Hole ${g.startHole}` : `Tee ${g.startHole}`}</b>
                        <span className="muted"> · {names.flight(g.flightId)}</span>
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn small ghost"
                      aria-pressed={g.locked}
                      onClick={() => dispatch({ type: "lock", group: g.number })}
                    >
                      {g.locked ? "Locked" : "Lock"}
                    </button>
                  </div>
                  {g.playerIds.map((id) => {
                    const p = playerById.get(id);
                    const r = regById.get(id);
                    if (!p || !r) return null;
                    return (
                      <div key={id} className={`slot${moving === id ? " picked" : ""}`}>
                        <span className="who">
                          <Avatar name={p.name} photo={p.photo} />
                          <span>
                            {p.name}

                            {r.flightId !== g.flightId && (
                              <span className="pill warn" style={{ marginLeft: ".4rem" }}>
                                Other flight
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="right">
                          <span className="hcp mono" title="Playing handicap">
                            {fmtHcp(r.playingHandicap)}
                          </span>
                          {!g.locked && (
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={() => setMoving(moving === id ? null : id)}
                              aria-label={`Move ${p.name}`}
                            >
                              {moving === id ? "Picked" : "Move"}
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {g.playerIds.length < config.minGroupSize && (
                    <div className="slot">
                      <span className="pill warn">
                        Only {g.playerIds.length} player{g.playerIds.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                  {canReceive && (
                    <div className="slot">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => {
                          dispatch({ type: "move", playerId: moving as string, toGroup: g.number });
                          setMoving(null);
                        }}
                      >
                        Move here
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
