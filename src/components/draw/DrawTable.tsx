"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { acceptsDrop, type DropIntent, type DropTarget } from "@/lib/draw/drop-intent";
import type { DrawTableSection } from "@/lib/draw/table-model";
import type { Issue } from "@/lib/draw/validate";

export interface DrawTableProps {
  sections: readonly DrawTableSection[];
  issuesByGroup: Map<number, Issue[]>;
  selectedPlayer: string | null;
  selectedGroup: number | null;
  manualOverrideIds: ReadonlySet<string>;
  onSelectPlayer: (id: string) => void;
  onSelectGroup: (n: number) => void;
  /**
   * Drag and drop, the same way the cards do it. Left out, the table stays a reading view: a
   * caller that passes no intent helper gets no drop targets.
   */
  active?: { id: string; via: "pick" | "drag" } | null;
  hover?: DropTarget | null;
  intentFor?: (target: DropTarget) => DropIntent | null;
  onHoverTarget?: (target: DropTarget | null) => void;
  onDropTarget?: (target: DropTarget) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  onPointerDragStart?: (id: string, event: ReactPointerEvent<HTMLElement>) => void;
  /**
   * A swap waiting for its second player. The cards complete it on a row's Swap button; the table
   * offers the same button so a drop on a full group can be finished here too.
   */
  swapFrom?: string | null;
  swapFromName?: string | null;
  onSwapWith?: (id: string) => void;
}

function issueMarker(issues: Issue[] | undefined): { text: string; cls: string } | null {
  if (!issues || issues.length === 0) return null;
  const blocking = issues.some((issue) => issue.severity === "blocking");
  return blocking ? { text: "Must fix", cls: "pill bad" } : { text: "Check", cls: "pill warn" };
}

/** The words for one place: what a drop there would do, or why it cannot. */
function dropLine(intent: DropIntent | null): string | null {
  if (!intent) return null;
  if (intent.kind === "none" || intent.kind === "refused") return null;
  return intent.kind === "move" && intent.note ? `${intent.label} ${intent.note}` : intent.label;
}

/**
 * Compact table view of the draw, laid out like the printed pairing sheet.
 * Each section is a start time and the chosen categorization: a class, or a flight with the class
 * kept as a row value.
 *
 * A player cell can be dragged onto another player's cell to swap the two, or onto a row to move
 * them into that group. The words under the cell say what will happen before the organizer lets go.
 */
export function DrawTable({
  sections,
  issuesByGroup,
  selectedPlayer,
  selectedGroup,
  manualOverrideIds,
  onSelectPlayer,
  onSelectGroup,
  active = null,
  hover = null,
  intentFor,
  onHoverTarget,
  onDropTarget,
  onDragStart,
  onDragEnd,
  onPointerDragStart,
  swapFrom = null,
  swapFromName = null,
  onSwapWith,
}: DrawTableProps) {
  if (sections.length === 0) {
    return <p className="hint">No groups to show.</p>;
  }

  const groupIntentOf = (group: number): DropIntent | null =>
    intentFor ? intentFor({ kind: "group", group }) : null;
  const playerIntentOf = (playerId: string): DropIntent | null =>
    intentFor ? intentFor({ kind: "player", playerId }) : null;
  /**
   * Where a release on one player's cell lands. A cell that cannot swap still lets the player join
   * that row's group when the group has room.
   */
  const targetForCell = (group: number, playerId: string): DropTarget => {
    if (acceptsDrop(playerIntentOf(playerId))) return { kind: "player", playerId };
    if (acceptsDrop(groupIntentOf(group))) return { kind: "group", group };
    return { kind: "player", playerId };
  };

  return (
    <div className="stack">
      {sections.map((section) => (
        <section key={section.key} className="stack tight" aria-label={section.heading}>
          <div className="wave-head">
            <h2>{section.heading}</h2>
            <span className="muted">
              {section.groups.length} groups ·{" "}
              {section.groups.reduce((n, g) => n + g.cells.filter((c) => c !== null).length, 0)}{" "}
              players
            </span>
          </div>
          <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-left text-[12px] uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="min-h-[44px] px-3 py-2 font-semibold">
                    Hole/Tee
                  </th>
                  <th scope="col" className="min-h-[44px] px-3 py-2 font-semibold">
                    Group
                  </th>
                  <th scope="col" className="min-h-[44px] px-3 py-2 font-semibold">
                    Class
                  </th>
                  {Array.from({ length: section.columns }, (_, col) => (
                    <th key={col} scope="col" className="min-h-[44px] px-3 py-2 font-semibold">
                      Player {col + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.groups.map((group) => {
                  const issues = issuesByGroup.get(group.number);
                  const marker = issueMarker(issues);
                  const markerTitle = issues?.[0]?.message;
                  const rowSelected = selectedGroup === group.number;
                  const groupIntent = groupIntentOf(group.number);
                  const overRow = hover?.kind === "group" && hover.group === group.number;
                  return (
                    <tr
                      key={group.number}
                      data-drop-group={group.number}
                      className={`border-b border-line last:border-b-0 ${
                        rowSelected ? "bg-fairway-soft/50" : ""
                      } ${overRow && acceptsDrop(groupIntent) ? "bg-fairway-soft" : ""}`}
                      onDragOver={(e) => {
                        // A player cell inside this row has already answered for itself.
                        if (!intentFor?.({ kind: "group", group: group.number })) return;
                        // A refused place still takes the release, so the answer can be said out
                        // loud; nothing is written when it is refused.
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDragEnter={() => onHoverTarget?.({ kind: "group", group: group.number })}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                          onHoverTarget?.(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        onHoverTarget?.(null);
                        onDropTarget?.({ kind: "group", group: group.number });
                      }}
                    >
                      <th
                        scope="row"
                        className="min-h-[44px] px-3 py-2 text-left align-middle font-semibold whitespace-nowrap"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{group.label}</span>
                          {marker && (
                            <span className={marker.cls} title={markerTitle}>
                              {marker.text}
                            </span>
                          )}
                          {group.locked && <span className="pill gold">Locked</span>}
                        </div>
                        {overRow && dropLine(groupIntent) && (
                          <p className="hint m-0 font-normal">{dropLine(groupIntent)}</p>
                        )}
                        {overRow && groupIntent?.kind === "pickSwap" && (
                          <p className="hint m-0 font-normal">{groupIntent.label}</p>
                        )}
                        {overRow && groupIntent?.kind === "refused" && (
                          <p className="hint m-0 font-normal">
                            <b>Can’t drop here.</b> {groupIntent.reason}
                          </p>
                        )}
                      </th>
                      <td className="min-h-[44px] px-3 py-2 align-middle">
                        <button
                          type="button"
                          className={`btn small ghost min-h-[44px] md:min-h-0 ${
                            rowSelected ? "!border-fairway !bg-fairway-soft !text-ink" : ""
                          }`}
                          aria-pressed={rowSelected}
                          aria-label={`Select group ${group.number}`}
                          onClick={() => onSelectGroup(group.number)}
                        >
                          {group.number}
                        </button>
                      </td>
                      <td className="min-h-[44px] px-3 py-2 align-middle">{group.flightName}</td>
                      {group.cells.map((cell, col) => {
                        if (!cell) {
                          return (
                            <td
                              key={`${group.number}-${col}`}
                              className="min-h-[44px] px-3 py-2 align-middle text-ink-muted"
                            >
                              <span aria-hidden="true">—</span>
                            </td>
                          );
                        }
                        const isSelected = selectedPlayer === cell.playerId;
                        const manual = manualOverrideIds.has(cell.playerId);
                        const overCell =
                          hover?.kind === "player" && hover.playerId === cell.playerId;
                        // The decision for the place the release will land, after the fallback from a
                        // swap that cannot happen to a move into this row's group.
                        const cellTarget = overCell
                          ? targetForCell(group.number, cell.playerId)
                          : null;
                        const cellIntent = cellTarget
                          ? cellTarget.kind === "player"
                            ? playerIntentOf(cellTarget.playerId)
                            : groupIntentOf(cellTarget.group)
                          : null;
                        return (
                          <td
                            key={cell.playerId}
                            data-drop-player={cell.playerId}
                            className={`min-h-[44px] px-3 py-2 align-middle ${
                              isSelected ? "bg-fairway-soft" : ""
                            } ${active?.id === cell.playerId ? "bg-gold-soft/45 ring-2 ring-gold ring-inset" : ""} ${overCell && acceptsDrop(cellIntent) ? "bg-fairway-soft" : ""}`}
                            onDragOver={(e) => {
                              e.stopPropagation();
                              if (!intentFor?.({ kind: "player", playerId: cell.playerId })) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                            }}
                            onDragEnter={(e) => {
                              e.stopPropagation();
                              onHoverTarget?.(targetForCell(group.number, cell.playerId));
                            }}
                            onDrop={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              onHoverTarget?.(null);
                              onDropTarget?.(targetForCell(group.number, cell.playerId));
                            }}
                          >
                            <span className="flex w-full items-start gap-1">
                              {!group.locked && onDragStart && (
                                <span
                                  className="grip"
                                  aria-hidden="true"
                                  draggable
                                  title={`Drag ${cell.name} onto another player to swap, or onto a group to move`}
                                  onDragStart={(e) => {
                                    const row = e.currentTarget.closest("tr");
                                    if (row) e.dataTransfer.setDragImage(row, 16, 16);
                                    e.dataTransfer.setData("text/plain", cell.playerId);
                                    e.dataTransfer.effectAllowed = "move";
                                    onDragStart?.(cell.playerId);
                                  }}
                                  onDragEnd={onDragEnd}
                                  onPointerDown={(e) => onPointerDragStart?.(cell.playerId, e)}
                                >
                                  ⋮⋮
                                </span>
                              )}
                              <button
                                type="button"
                                className={`inline-flex min-h-[44px] w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairway md:min-h-0 ${
                                  isSelected
                                    ? "font-semibold text-ink ring-2 ring-inset ring-fairway"
                                    : ""
                                }`}
                                aria-pressed={isSelected}
                                draggable={!group.locked}
                                title={
                                  group.locked
                                    ? undefined
                                    : `Drag ${cell.name} onto another player to swap, or onto a group to move`
                                }
                                onDragStart={(e) => {
                                  const row = e.currentTarget.closest("tr");
                                  if (row) e.dataTransfer.setDragImage(row, 16, 16);
                                  e.dataTransfer.setData("text/plain", cell.playerId);
                                  e.dataTransfer.effectAllowed = "move";
                                  onDragStart?.(cell.playerId);
                                }}
                                onDragEnd={onDragEnd}
                                onClick={() => onSelectPlayer(cell.playerId)}
                              >
                                <span className="min-w-0 flex-1 break-words">{cell.name}</span>
                                {manual && <span className="pill gold">Manual</span>}
                              </button>
                            </span>
                            {onSwapWith && swapFrom && swapFrom !== cell.playerId && (
                              <button
                                type="button"
                                className="btn small ghost mt-1 min-h-[44px] md:min-h-0"
                                aria-label={`Swap ${cell.name} with ${swapFromName ?? "the player in hand"}`}
                                onClick={() => onSwapWith(cell.playerId)}
                              >
                                Swap
                              </button>
                            )}
                            {overCell && dropLine(cellIntent) && (
                              <p className="hint m-0">{dropLine(cellIntent)}</p>
                            )}
                            {overCell && cellIntent?.kind === "refused" && (
                              <p className="hint m-0">
                                <b>Can’t drop here.</b> {cellIntent.reason}
                              </p>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
