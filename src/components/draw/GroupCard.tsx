"use client";

import { memo, useState } from "react";
import { Avatar } from "@/components/bits";
import type { DeskRegistration, PlayerRecord } from "@/lib/data/types";
import type { DrawGroup, DropCheck, Issue } from "@/lib/draw/validate";
import { fmtHcp, fmtIndex, fmtTime, photoOf } from "@/lib/format";

export interface GroupCardProps {
  g: DrawGroup;
  shotgun: boolean;
  groupSize: number;
  minGroupSize: number;
  flightName: string;
  players: Map<string, PlayerRecord>;
  regs: Map<string, DeskRegistration>;
  /** Players the organizer moved by hand; shown with a Manual pill. */
  manualOverrideIds: ReadonlySet<string>;
  /** Issues that belong to this group. */
  issues: Issue[];
  /** Player picked with the Move button, or being dragged. At most one is active. */
  active: { id: string; via: "pick" | "drag" } | null;
  /** What would happen if the active player went into this group. */
  drop: DropCheck | null;
  selectedPlayer: string | null;
  selected: boolean;
  flash: boolean;
  onSelectPlayer: (id: string) => void;
  onSelectGroup: (n: number) => void;
  onPick: (id: string | null) => void;
  onLock: (n: number) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMoveHere: (n: number) => void;
  /** Drag-and-drop asks the page directly, so it never depends on a re-render having happened. */
  allowDrop: (n: number) => boolean;
  dropOn: (n: number) => void;
}

function GroupCardImpl(p: GroupCardProps) {
  const { g, active, drop } = p;
  const [over, setOver] = useState(false);
  const n = g.playerIds.length;
  const allProvisional = n > 0 && g.playerIds.every((id) => p.regs.get(id)?.provisional === true);
  // What the player records are actually short of. The entry's own index is on file, so the note
  // names the missing facts rather than saying the handicap is absent.
  const groupMissing = [...new Set(g.playerIds.flatMap((id) => p.regs.get(id)?.missing ?? []))];
  const own = active ? g.playerIds.includes(active.id) : false;
  const blocking = p.issues.some((i) => i.severity === "blocking");
  const warning = p.issues.some((i) => i.severity === "warning");
  const canDrop = Boolean(active && drop?.ok && !own);

  const cls = [
    "group",
    g.locked && "locked",
    p.selected && "selected",
    p.flash && "flash",
    active && !own && (drop?.ok ? "target" : "refuse"),
    over && canDrop && "over",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      id={`group-${g.number}`}
      className={cls}
      aria-label={`Group ${g.number}, ${p.shotgun ? `hole ${g.startHole}` : `tee ${g.startHole}`}, ${fmtTime(g.time)}`}
      onDragOver={(e) => {
        if (p.allowDrop(g.number)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDragEnter={() => setOver(true)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        p.dropOn(g.number);
      }}
    >
      <div className="group-head">
        <button
          type="button"
          className="who headbtn"
          onClick={() => p.onSelectGroup(g.number)}
          aria-label={`Group ${g.number} details`}
        >
          <span className="hole" aria-hidden="true">
            {g.startHole}
            {g.wave ?? ""}
          </span>
          <span>
            <b>{p.shotgun ? `Hole ${g.startHole}` : `Tee ${g.startHole}`}</b>
            <span className="muted"> · Group {g.number}</span>
            <br />
            <span className="mono nowrap">{fmtTime(g.time)}</span>
            <span className="muted"> · {p.flightName}</span>
          </span>
        </button>
        <span className="right">
          <button
            type="button"
            className={`btn small ${g.locked ? "" : "ghost"}`}
            aria-pressed={g.locked}
            onClick={() => p.onLock(g.number)}
            title={
              g.locked ? "Unlock so players can move in or out" : "Lock to keep this group as it is"
            }
          >
            {g.locked ? "Unlock" : "Lock"}
          </button>
        </span>
      </div>

      {(blocking || warning || g.locked || n >= p.groupSize) && (
        <div className="flags">
          {blocking && <span className="pill bad">Must fix</span>}
          {warning && !blocking && <span className="pill warn">Check</span>}
          {g.locked && <span className="pill gold">Locked</span>}
          {n >= p.groupSize && <span className="pill ok">Full</span>}
        </div>
      )}

      {allProvisional && (
        <p className="hint">
          Provisional group:{" "}
          {groupMissing.length > 0 ? groupMissing.join(" and ") : "a routing fact"} missing on the
          player records, so no category and no playing handicap are set. Each entry keeps the index
          from the club sheet; fill these in and re-run the draw.
        </p>
      )}

      {g.playerIds.map((id) => {
        const pl = p.players.get(id);
        const r = p.regs.get(id);
        if (!pl || !r) return null;
        const picked = active?.id === id;
        return (
          <div
            key={id}
            className={`slot${picked ? " picked" : ""}${p.selectedPlayer === id ? " selected" : ""}`}
          >
            {!g.locked && (
              <span
                className="grip"
                aria-hidden="true"
                draggable
                title="Drag to another group"
                onDragStart={(e) => {
                  const row = e.currentTarget.parentElement;
                  if (row) e.dataTransfer.setDragImage(row, 16, 16);
                  e.dataTransfer.setData("text/plain", id);
                  e.dataTransfer.effectAllowed = "move";
                  p.onDragStart(id);
                }}
                onDragEnd={p.onDragEnd}
              >
                ⋮⋮
              </span>
            )}
            <button type="button" className="who headbtn" onClick={() => p.onSelectPlayer(id)}>
              <Avatar name={pl.name} photo={photoOf(pl)} />
              <span className="flex flex-wrap items-center gap-1.5">
                {pl.name}
                {p.manualOverrideIds.has(id) && <span className="pill gold">Manual</span>}
                {r.provisional && <span className="pill warn">Provisional</span>}
                {r.flightId && r.flightId !== g.flightId && (
                  <span className="pill warn">Other flight</span>
                )}
                {r.provisional && r.missing.length > 0 && (
                  <span className="hint">no {r.missing.join(", no ")}</span>
                )}
              </span>
            </button>
            <span className="right">
              <span
                className="hcp mono"
                title={
                  r.playingHandicap !== null
                    ? "Course handicap"
                    : r.frozenIndex !== null
                      ? "Index on the entry. No course handicap until the category is set."
                      : "No course handicap"
                }
              >
                {r.playingHandicap !== null
                  ? fmtHcp(r.playingHandicap)
                  : r.frozenIndex !== null
                    ? fmtIndex(r.frozenIndex)
                    : "—"}
              </span>
              {g.locked ? (
                <span className="hint">Locked</span>
              ) : (
                <button
                  type="button"
                  className="btn small ghost"
                  aria-pressed={active?.via === "pick" && picked}
                  aria-label={`Move ${pl.name}`}
                  onClick={() => p.onPick(picked ? null : id)}
                >
                  {picked && active?.via === "pick" ? "Picked" : "Move"}
                </button>
              )}
            </span>
          </div>
        );
      })}

      {/* Always present, so the board never shifts under the cursor when a move starts. */}
      <div
        className={`slot foot${active && !own && drop ? (drop.ok ? " drop ok" : " drop no") : ""}`}
        aria-live="polite"
      >
        {active && !own && drop ? (
          drop.ok ? (
            <>
              <span>
                {drop.notes.length > 0 ? `${drop.notes.join(" ")} ` : ""}
                {active.via === "drag" ? "Drop here." : "Room for one more."}
              </span>
              {active.via === "pick" && (
                <button type="button" className="btn small" onClick={() => p.onMoveHere(g.number)}>
                  Move here
                </button>
              )}
            </>
          ) : (
            <span>
              <b>Can’t move here.</b> {drop.reason}
            </span>
          )
        ) : (
          <span className="muted">
            <span className="cap" role="img" aria-label={`${n} of ${p.groupSize} players`}>
              {Array.from({ length: p.groupSize }, (_, i) => (
                <i key={`${g.number}-${i}`} className={i < n ? "on" : ""} />
              ))}
            </span>
            {n === 0 ? " Empty group" : ` ${n} of ${p.groupSize} players`}
          </span>
        )}
      </div>
    </article>
  );
}

export const GroupCard = memo(GroupCardImpl);
