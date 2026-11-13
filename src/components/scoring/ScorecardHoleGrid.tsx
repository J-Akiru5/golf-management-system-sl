"use client";

import type { HoleDefinition } from "@/lib/scoring";
import { normalizeCellInput } from "@/lib/scoring/cell-input";
import type { ScanCardReview } from "@/lib/scoring/scan/review";

interface ScorecardHoleGridProps {
  holes: readonly HoleDefinition[];
  strokes: Record<number, string>;
  cells: ScanCardReview["cells"];
  scanned: boolean;
  disabled?: boolean;
  outTotal: number;
  inTotal: number;
  outPoints: number;
  inPoints: number;
  points: Readonly<Record<number, number>>;
  pointsKind: "net" | "gross";
  onChange: (hole: number, value: string) => void;
  onEnter: (hole: number) => void;
}

function stateClasses(state: string | undefined): string {
  if (state === "check") return "bg-warning/10";
  if (state === "blank") return "bg-danger/10";
  if (state === "changed" || state === "typed") return "bg-info/10";
  return "";
}

function stateLabel(state: string | undefined): string {
  if (state === "check") return "Check";
  if (state === "blank") return "Blank";
  if (state === "changed") return "Changed";
  if (state === "typed") return "Typed";
  return "";
}

function ScoreCell({
  hole,
  strokes,
  cell,
  scanned,
  disabled,
  onChange,
  onEnter,
}: {
  hole: HoleDefinition;
  strokes: Record<number, string>;
  cell: ScanCardReview["cells"][number] | undefined;
  scanned: boolean;
  disabled?: boolean;
  onChange: (hole: number, value: string) => void;
  onEnter: (hole: number) => void;
}) {
  const state = scanned ? cell?.state : undefined;
  const flagged = state === "check" || state === "blank";
  return (
    <div className={`grid gap-0.5 px-0.5 py-0.5 ${stateClasses(state)}`}>
      <input
        id={`hole-${hole.number}`}
        type="text"
        inputMode="numeric"
        value={strokes[hole.number] ?? ""}
        aria-invalid={flagged ? true : undefined}
        aria-describedby={flagged ? "scan-check-hint" : undefined}
        className="h-11 w-full border-0 bg-transparent px-0 text-center font-mono text-[15px] font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary lg:h-9"
        onChange={(event) => onChange(hole.number, normalizeCellInput(event.target.value))}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onEnter(hole.number);
        }}
        disabled={disabled}
        aria-label={`Hole ${hole.number}, par ${hole.par}, stroke index ${hole.strokeIndex}`}
      />
      <span className="min-h-[10px] text-[9px] leading-none text-ink-muted">
        {stateLabel(state)}
      </span>
    </div>
  );
}

function NineTable({
  label,
  rows,
  strokes,
  cells,
  scanned,
  disabled,
  points,
  pointsKind,
  total,
  pointsTotal,
  onChange,
  onEnter,
}: {
  label: "OUT" | "IN";
  rows: readonly HoleDefinition[];
  strokes: Record<number, string>;
  cells: ScanCardReview["cells"];
  scanned: boolean;
  disabled?: boolean;
  points: Readonly<Record<number, number>>;
  pointsKind: "net" | "gross";
  total: number;
  pointsTotal: number;
  onChange: (hole: number, value: string) => void;
  onEnter: (hole: number) => void;
}) {
  const par = rows.reduce((sum, hole) => sum + hole.par, 0);
  const cell = "border border-line px-1 py-1 text-center align-middle";
  // The label column stays put while the nine holes scroll sideways. A solid background keeps the
  // moving cells from showing through, and the same sunken tone works in light and dark mode.
  const labelCell = `${cell} sticky left-0 z-10 bg-surface-sunken text-left text-[11px] font-semibold normal-case text-ink-muted`;
  const isPickup = (hole: number) => (strokes[hole] ?? "").trim().toUpperCase() === "X";
  return (
    <div
      className="overflow-x-auto rounded-md border border-line"
      tabIndex={0}
      role="region"
      aria-label={`${label === "OUT" ? "Front nine" : "Back nine"} scorecard, scroll sideways if needed`}
    >
      <table className="w-full min-w-[640px] border-collapse text-[12px]">
        <caption className="sr-only">{label === "OUT" ? "Front nine" : "Back nine"}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-16 border border-line bg-primary px-1 py-1.5 text-left text-[11px] font-semibold normal-case tracking-wide text-on-primary"
            >
              Hole
            </th>
            {rows.map((hole) => (
              <th
                key={hole.number}
                scope="col"
                className="border border-line bg-primary px-1 py-1.5 text-center text-[12px] font-bold text-on-primary"
              >
                {hole.number}
              </th>
            ))}
            <th
              scope="col"
              className="border border-line bg-primary px-1 py-1.5 text-center text-[11px] font-bold text-on-primary"
            >
              {label}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-surface-sunken">
            <th scope="row" className={labelCell}>
              Par
            </th>
            {rows.map((hole) => (
              <td key={hole.number} className={`${cell} font-semibold text-ink`}>
                {hole.par}
              </td>
            ))}
            <td className={`${cell} bg-surface-sunken font-bold text-ink`}>{par}</td>
          </tr>
          <tr>
            <th scope="row" className={labelCell}>
              <abbr title="Stroke index">SI</abbr>
              <span className="sr-only"> (stroke index)</span>
            </th>
            {rows.map((hole) => (
              <td key={hole.number} className={`${cell} text-ink-muted`}>
                {hole.strokeIndex}
              </td>
            ))}
            <td className={`${cell} bg-surface-sunken`} />
          </tr>
          <tr>
            <th scope="row" className={labelCell}>
              Score
            </th>
            {rows.map((hole) => (
              <td key={hole.number} className="border border-line p-0.5 text-center align-middle">
                <ScoreCell
                  hole={hole}
                  strokes={strokes}
                  cell={cells[hole.number]}
                  scanned={scanned}
                  disabled={disabled}
                  onChange={onChange}
                  onEnter={onEnter}
                />
              </td>
            ))}
            <td className={`${cell} bg-surface-sunken font-mono text-[14px] font-bold text-ink`}>
              {total || "–"}
            </td>
          </tr>
          <tr>
            <th scope="row" className={labelCell}>
              X<span className="sr-only"> (pick-up)</span>
            </th>
            {rows.map((hole) => {
              const picked = isPickup(hole.number);
              return (
                <td key={hole.number} className="border border-line p-0.5 text-center align-middle">
                  <button
                    type="button"
                    aria-pressed={picked}
                    aria-label={`Hole ${hole.number} pick-up`}
                    onClick={() => onChange(hole.number, picked ? "" : "X")}
                    disabled={disabled}
                    className={`h-11 w-full rounded border text-[13px] font-bold lg:h-9 ${
                      picked
                        ? "border-primary bg-primary text-on-primary"
                        : "border-line bg-surface-sunken text-ink"
                    }`}
                  >
                    X
                  </button>
                </td>
              );
            })}
            <td className={`${cell} bg-surface-sunken`} />
          </tr>
          <tr>
            <th scope="row" className={labelCell}>
              {pointsKind === "net" ? "Net pts" : "Gross pts"}
            </th>
            {rows.map((hole) => (
              <td key={hole.number} className={`${cell} font-mono font-semibold text-ink`}>
                {points[hole.number] ?? ""}
              </td>
            ))}
            <td className={`${cell} bg-surface-sunken font-mono text-[14px] font-bold text-ink`}>
              {pointsTotal}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** The card as the paper sheet: nine holes to a table, with par, handicap row, score and points. */
export function ScorecardHoleGrid({
  holes,
  strokes,
  cells,
  scanned,
  disabled = false,
  outTotal,
  inTotal,
  outPoints,
  inPoints,
  points,
  pointsKind,
  onChange,
  onEnter,
}: ScorecardHoleGridProps) {
  const front = holes.filter((hole) => hole.number <= 9);
  const back = holes.filter((hole) => hole.number >= 10);
  return (
    <div className="grid gap-2">
      <p className="hint m-0 sm:hidden print:hidden">
        Swipe the card sideways to reach every hole.
      </p>
      <NineTable
        label="OUT"
        rows={front}
        strokes={strokes}
        cells={cells}
        scanned={scanned}
        disabled={disabled}
        points={points}
        pointsKind={pointsKind}
        total={outTotal}
        pointsTotal={outPoints}
        onChange={onChange}
        onEnter={onEnter}
      />
      <NineTable
        label="IN"
        rows={back}
        strokes={strokes}
        cells={cells}
        scanned={scanned}
        disabled={disabled}
        points={points}
        pointsKind={pointsKind}
        total={inTotal}
        pointsTotal={inPoints}
        onChange={onChange}
        onEnter={onEnter}
      />
    </div>
  );
}
