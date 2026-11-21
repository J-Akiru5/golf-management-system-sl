"use client";

import { ACCESS_LEVEL_LABEL, ACCESS_LEVELS, type AccessLevel } from "@/lib/access/pages";
import { cn } from "@/lib/ui/cn";

/**
 * A three-state control: No access, View, Edit. Real radio buttons with a shared name, so a screen
 * reader hears one group and the arrow keys work. The label is the whole target and is 44px tall, so
 * it is comfortable on a phone and for a reader who needs a large target.
 */
export function LevelControl({
  name,
  label,
  value,
  onChange,
  levels = ACCESS_LEVELS,
  disabled = false,
  className,
}: {
  /** Unique on the page: radios with the same name are one group. */
  name: string;
  /** What this group controls, read before the three choices. */
  label: string;
  value: AccessLevel;
  onChange: (next: AccessLevel) => void;
  /** The levels this page supports. Everything today takes all three. */
  levels?: ReadonlyArray<AccessLevel>;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-line-strong p-0.5",
        className,
      )}
    >
      {levels.map((level) => (
        <label key={level} className="relative flex-1">
          <input
            type="radio"
            name={name}
            value={level}
            checked={value === level}
            disabled={disabled}
            onChange={() => onChange(level)}
            aria-label={`${label}: ${ACCESS_LEVEL_LABEL[level]}`}
            className="peer sr-only"
          />
          <span
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-sm px-2.5 text-center text-[12.5px] font-medium leading-tight text-ink-muted transition-colors",
              "peer-checked:bg-surface-sunken peer-checked:font-semibold peer-checked:text-ink",
              "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]",
              "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
            )}
          >
            {ACCESS_LEVEL_LABEL[level]}
          </span>
        </label>
      ))}
    </div>
  );
}
