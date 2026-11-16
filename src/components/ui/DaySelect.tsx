"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/ui/cn";

/**
 * One day, chosen from a list. It knows nothing about staff or players: the caller names the days
 * and decides what a day is worth.
 *
 * A row of pills used to overflow sideways on a phone. This replaces it with a single control that
 * shows the current day and opens the rest: a bottom sheet on a phone, a popover from `lg` up. The
 * whole list is one combobox, so a screen reader announces the day and the keyboard walks the rows
 * with the arrows, chooses with Enter, and leaves with Escape.
 */

export interface DayOption {
  /** The caller's own identifier. Numbers and strings both work. */
  value: string | number;
  /** What the closed control shows, for example "Day 1 · Thu, Nov 12". */
  label: string;
  /** An optional second line in the list, for example "Today" or "AM and PM". */
  hint?: string;
}

/** The row that matches `value`, or the first row when the value is not in the list. */
export function selectedDayIndex(days: readonly DayOption[], value: string | number): number {
  const index = days.findIndex((day) => day.value === value);
  return index === -1 ? 0 : index;
}

/** The next highlighted row, wrapping at both ends so one arrow key always moves somewhere. */
export function moveDayIndex(count: number, active: number, step: number): number {
  if (count <= 0) return 0;
  return (((active + step) % count) + count) % count;
}

export function DaySelect({
  days,
  value,
  onChange,
  label,
}: {
  days: readonly DayOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  /** The accessible name of the control, for example "Playing day". */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => selectedDayIndex(days, value));
  const baseId = useId();
  const listId = `${baseId}-list`;
  const wrapper = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  const current = days.find((day) => day.value === value) ?? days[0];

  // A click anywhere else closes the list. The wrapper holds the sheet on a phone too, because a
  // fixed panel is still a DOM child of it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapper.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted row in view when the arrows move down a long event.
  useEffect(() => {
    if (!open) return;
    rows.current[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => {
    setActive(selectedDayIndex(days, value));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const choose = (option: DayOption) => {
    onChange(option.value);
    setOpen(false);
    button.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => moveDayIndex(days.length, index, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => moveDayIndex(days.length, index, -1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, days.length - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = days[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  if (days.length === 0) return null;

  // One day is not a choice: say which day it is and leave the list out of it.
  if (days.length === 1) {
    return (
      <p className="flex min-h-12 items-center text-[15px] font-semibold text-ink">
        {current?.label}
      </p>
    );
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${baseId}-${active}` : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className="flex min-h-12 w-full items-center gap-2 rounded-[12px] border border-line bg-surface-raised px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        <span className="sr">{label}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
          {current?.label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-5 shrink-0 text-ink-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-forest/40 lg:hidden"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-[18px] border border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-lift lg:absolute lg:inset-x-0 lg:top-full lg:bottom-auto lg:mt-2 lg:max-h-80 lg:rounded-[14px] lg:pb-0">
            <p className="px-4 pt-3 pb-1 text-xs font-bold tracking-wide text-ink-muted uppercase lg:hidden">
              {label}
            </p>
            <ul id={listId} role="listbox" aria-label={label} className="p-1">
              {days.map((day, index) => {
                const on = day.value === value;
                return (
                  <li
                    key={day.value}
                    ref={(node) => {
                      rows.current[index] = node;
                    }}
                    id={`${baseId}-${index}`}
                    role="option"
                    aria-selected={on}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(day)}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2",
                      index === active && "bg-surface-sunken",
                      on ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{day.label}</span>
                      {day.hint && (
                        <span className="block truncate text-[13px] text-ink-muted">{day.hint}</span>
                      )}
                    </span>
                    {on && <Check aria-hidden="true" className="size-5 shrink-0 text-gold-ink" />}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
