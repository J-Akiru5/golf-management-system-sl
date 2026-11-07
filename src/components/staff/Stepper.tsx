"use client";

import { Minus, Plus } from "lucide-react";
import { clampStrokes, MAX_STROKES, MIN_STROKES } from "@/lib/staff/score";
import styles from "./staff.module.css";

/**
 * One hole's score for one player. Two large buttons and the number between them: nothing to type,
 * nothing to scroll, and the same size for a thumb in a golf cart.
 */
export function Stepper({
  label,
  value,
  par,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number | null;
  par: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const current = value ?? par;
  const set = (next: number) => onChange(clampStrokes(next));
  return (
    <div className={styles.stepper} role="group" aria-label={`${label} score`}>
      <button
        type="button"
        className={styles.stepperButton}
        onClick={() => set(current - 1)}
        disabled={disabled || (value !== null && value <= MIN_STROKES)}
        aria-label={`One fewer stroke for ${label}`}
      >
        <Minus aria-hidden="true" size={22} />
      </button>
      <span
        className={`${styles.scoreValue} ${value === null ? styles.scoreValueBlank : ""}`}
        aria-live="polite"
        data-score={value ?? ""}
      >
        {value ?? "–"}
      </span>
      <button
        type="button"
        className={styles.stepperButton}
        onClick={() => set(current + 1)}
        disabled={disabled || current >= MAX_STROKES}
        aria-label={`One more stroke for ${label}`}
      >
        <Plus aria-hidden="true" size={22} />
      </button>
      <button
        type="button"
        className={styles.parButton}
        onClick={() => set(par)}
        disabled={disabled}
        aria-label={`Par ${par} for ${label}`}
        title={`Set par (${par})`}
      >
        Par {par}
      </button>
    </div>
  );
}
