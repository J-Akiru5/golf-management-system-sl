"use client";

import type { HoleDefinition } from "@/lib/scoring";
import type { ScanCardReview } from "@/lib/scoring/scan/review";

interface ScorecardHoleGridProps {
  holes: readonly HoleDefinition[];
  strokes: Record<number, string>;
  cells: ScanCardReview["cells"];
  scanned: boolean;
  disabled?: boolean;
  outTotal: number;
  inTotal: number;
  onChange: (hole: number, value: string) => void;
  onEnter: (hole: number) => void;
}

function statusClass(state: string | undefined): string {
  if (state === "check") return "border-warning text-warning";
  if (state === "blank") return "border-danger text-danger";
  if (state === "changed" || state === "typed") return "border-info text-info";
  return "border-line text-ink-muted";
}

function HoleCell({
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
    <div className={`grid gap-1 rounded-md border bg-surface p-1.5 ${statusClass(state)}`}>
      <div className="flex items-baseline justify-between gap-1 text-[10px] leading-tight">
        <b className="mono">{hole.number}</b>
        <span>
          par {hole.par} · SI {hole.strokeIndex}
        </span>
      </div>
      <input
        id={`hole-${hole.number}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={20}
        value={strokes[hole.number] ?? ""}
        aria-invalid={flagged ? true : undefined}
        aria-describedby={flagged ? "scan-check-hint" : undefined}
        className={`min-h-11 w-full rounded border bg-surface-raised px-1 text-center font-mono text-[16px] font-bold text-ink ${
          state === "check" ? "border-warning" : state === "blank" ? "border-danger" : "border-line"
        }`}
        onChange={(event) => onChange(hole.number, event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onEnter(hole.number);
        }}
        disabled={disabled}
        aria-label={`Hole ${hole.number}, par ${hole.par}, stroke index ${hole.strokeIndex}`}
      />
      <span className="text-center text-[10px] leading-tight">
        {state ? (cell?.label ?? "Empty") : "—"}
      </span>
    </div>
  );
}

function TotalCell({ label, value, par }: { label: string; value: number; par: number }) {
  return (
    <div className="grid content-center gap-0.5 rounded-md border border-line bg-surface-sunken p-1.5 text-center">
      <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{label}</span>
      <b className="mono text-[18px] leading-tight">{value}</b>
      <span className="text-[10px] text-ink-muted">par {par}</span>
    </div>
  );
}

/** Two rows of nine holes, with OUT and IN at the end of each row. */
export function ScorecardHoleGrid({
  holes,
  strokes,
  cells,
  scanned,
  disabled = false,
  outTotal,
  inTotal,
  onChange,
  onEnter,
}: ScorecardHoleGridProps) {
  const front = holes.filter((hole) => hole.number <= 9);
  const back = holes.filter((hole) => hole.number >= 10);
  const par = (list: readonly HoleDefinition[]) => list.reduce((sum, hole) => sum + hole.par, 0);
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-10">
        {front.map((hole) => (
          <HoleCell
            key={hole.number}
            hole={hole}
            strokes={strokes}
            cell={cells[hole.number]}
            scanned={scanned}
            disabled={disabled}
            onChange={onChange}
            onEnter={onEnter}
          />
        ))}
        <TotalCell label="OUT" value={outTotal} par={par(front)} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-10">
        {back.map((hole) => (
          <HoleCell
            key={hole.number}
            hole={hole}
            strokes={strokes}
            cell={cells[hole.number]}
            scanned={scanned}
            disabled={disabled}
            onChange={onChange}
            onEnter={onEnter}
          />
        ))}
        <TotalCell label="IN" value={inTotal} par={par(back)} />
      </div>
    </div>
  );
}
