"use client";

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
}

function issueMarker(issues: Issue[] | undefined): { text: string; cls: string } | null {
  if (!issues || issues.length === 0) return null;
  const blocking = issues.some((issue) => issue.severity === "blocking");
  return blocking ? { text: "Must fix", cls: "pill bad" } : { text: "Check", cls: "pill warn" };
}

/**
 * Compact table view of the draw, laid out like the printed pairing sheet.
 * Each section is a start time and class with one row per group.
 */
export function DrawTable({
  sections,
  issuesByGroup,
  selectedPlayer,
  selectedGroup,
  manualOverrideIds,
  onSelectPlayer,
  onSelectGroup,
}: DrawTableProps) {
  if (sections.length === 0) {
    return <p className="hint">No groups to show.</p>;
  }

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
                    Class (flight)
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
                  return (
                    <tr
                      key={group.number}
                      className={`border-b border-line last:border-b-0 ${
                        rowSelected ? "bg-fairway-soft/50" : ""
                      }`}
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
                        return (
                          <td
                            key={cell.playerId}
                            className={`min-h-[44px] px-3 py-2 align-middle ${
                              isSelected ? "bg-fairway-soft" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className={`inline-flex min-h-[44px] w-full items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairway md:min-h-0 ${
                                isSelected
                                  ? "font-semibold text-ink ring-2 ring-inset ring-fairway"
                                  : ""
                              }`}
                              aria-pressed={isSelected}
                              onClick={() => onSelectPlayer(cell.playerId)}
                            >
                              <span className="min-w-0 flex-1 break-words">{cell.name}</span>
                              {manual && <span className="pill gold">Manual</span>}
                            </button>
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
