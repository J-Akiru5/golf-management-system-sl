"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cardPar,
  HOLES_ON_A_CARD,
  holesComplete,
  parProblem,
  strokeIndexProblem,
  teeParMismatches,
} from "@/lib/data/course-data";
import type { Hole } from "@/lib/data/types";
import type { Tee } from "@/lib/routing";

/**
 * The whole course card in one place: par and stroke index for every hole, the card's total par,
 * and a warning when a tee's stored par disagrees with the card.
 *
 * The component is controlled. It never saves by itself, so the Settings screen can keep its
 * draft-then-save flow and the Course & holes screen can own its own save button. Hole numbers are
 * fixed; only the numbers a scorecard carries are editable, and a blank stays blank rather than
 * being filled with a guessed par.
 */
export function CourseCardEditor({
  holes,
  tees = [],
  onChange,
  onTeeParChange,
  disabled = false,
  showHeading = true,
  idPrefix = "course-card",
}: {
  holes: readonly Hole[];
  tees?: readonly Tee[];
  onChange: (holes: Hole[]) => void;
  /** Offered when the caller can also update the tee rows; omit to show a read-only warning. */
  onTeeParChange?: (teeId: string, par: number) => void;
  disabled?: boolean;
  /** The parent card may already carry the title, as it does on Course & holes. */
  showHeading?: boolean;
  /** Keeps input ids unique when two editors are mounted on one page. */
  idPrefix?: string;
}) {
  const total = cardPar(holes);
  const parsEntered = holes.filter((hole) => hole.par !== null).length;
  const strokeIndexesEntered = holes.filter((hole) => hole.strokeIndex !== null).length;
  const progress = `${parsEntered}/${HOLES_ON_A_CARD} pars · ${strokeIndexesEntered}/${HOLES_ON_A_CARD} stroke indexes`;
  const complete = holesComplete(holes);
  const siIssue = strokeIndexProblem(holes);
  const holeParIssue = parProblem(holes);
  const mismatches =
    complete && siIssue === null && holeParIssue === null ? teeParMismatches(tees, total) : [];

  const setHole = (number: number, patch: Partial<Pick<Hole, "par" | "strokeIndex">>) => {
    onChange(holes.map((hole) => (hole.number === number ? { ...hole, ...patch } : hole)));
  };

  // A blank input means "not entered", never zero. Anything that is not a whole number is treated
  // the same way, so the field cannot silently turn "4.5" into 4.
  const wholeNumberOrNull = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isInteger(value) ? value : null;
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        {showHeading && (
          <div className="grid gap-0.5">
            <span className="text-[13px] font-semibold">Course card</span>
            <p className="hint m-0">
              One par and one stroke index per hole. Every event on this course uses this card.
            </p>
          </div>
        )}
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-display text-[24px] leading-none font-extrabold tnum">{total}</span>
          <span className="text-[12px] text-ink-muted">par · {progress}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {holes.map((hole) => {
          const parId = `${idPrefix}-hole-${hole.number}-par`;
          const siId = `${idPrefix}-hole-${hole.number}-si`;
          return (
            <div
              key={hole.number}
              role="group"
              aria-label={`Hole ${hole.number}`}
              className="grid gap-1 rounded-[12px] border border-line bg-surface-raised p-2"
            >
              <span className="font-display text-[11px] font-extrabold tracking-[.06em] text-ink-muted">
                H{hole.number}
              </span>
              <div className="grid grid-cols-[2.2rem_minmax(0,1fr)] items-center gap-1.5">
                <label htmlFor={parId} className="text-[11px] font-semibold text-ink-muted">
                  Par
                </label>
                <input
                  id={parId}
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={6}
                  value={hole.par ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    setHole(hole.number, { par: wholeNumberOrNull(event.target.value) })
                  }
                  className="h-8 px-1.5 text-center text-[13px]"
                  aria-label={`Hole ${hole.number} par`}
                />
              </div>
              <div className="grid grid-cols-[2.2rem_minmax(0,1fr)] items-center gap-1.5">
                <label htmlFor={siId} className="text-[11px] font-semibold text-ink-muted">
                  SI
                </label>
                <input
                  id={siId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={18}
                  value={hole.strokeIndex ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    setHole(hole.number, { strokeIndex: wholeNumberOrNull(event.target.value) })
                  }
                  className="h-8 px-1.5 text-center text-[13px]"
                  aria-label={`Hole ${hole.number} stroke index`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {holeParIssue && (
        <p className="notice bad text-[13px]" role="alert">
          {holeParIssue}
        </p>
      )}
      {siIssue && (
        <p className="notice bad text-[13px]" role="alert">
          {siIssue}
        </p>
      )}
      {!complete && (
        <p className="hint m-0">
          A card saves only when all 18 holes have a par and a stroke index. A blank card leaves the
          stored card alone; it is never filled with a guessed number.
        </p>
      )}

      {mismatches.length > 0 && (
        <div className="notice warn grid gap-2" role="note">
          <p className="m-0 text-[13px]">
            <b>This card is par {total}, but the tee rows disagree.</b>{" "}
            {mismatches.map((tee) => `${tee.name} says ${tee.par}`).join(", ")}. The Course Handicap
            formula subtracts the tee par, so the same card would give a different handicap from
            each tee.
          </p>
          {onTeeParChange && (
            <div className="flex flex-wrap gap-2">
              {mismatches.map((tee) => (
                <Button
                  key={tee.id}
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onTeeParChange(tee.id, total)}
                >
                  <CheckCircle2 aria-hidden="true" />
                  Set {tee.name} par to {total}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {complete && mismatches.length === 0 && tees.length > 0 && (
        <p className="m-0 flex items-start gap-2 text-[12px] text-success">
          <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Every tee par matches the card total.
        </p>
      )}
    </div>
  );
}
