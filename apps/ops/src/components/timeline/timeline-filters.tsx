"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/field";
import { type PersonOption, type TimelineFilter } from "@/lib/timeline/filters";
import { TIMELINE_KIND_LABEL, type TimelineKind } from "@/lib/timeline/types";
import { cn } from "@/lib/ui/cn";
import { KIND_STYLE } from "./kind-style";

/**
 * The filter bar: a chip per kind with how many items it holds, and a person picker.
 *
 * The chips are `aria-pressed` toggles with a visible pressed state, and each is at least 44 px
 * tall. Switching the last one off puts every kind back on, so the page never sits on an empty
 * filter the person did not ask for.
 */
export function TimelineFilters({
  kinds,
  counts,
  total,
  people,
  filter,
  onChange,
}: {
  /** The kinds that have at least one item, in the fixed order. */
  kinds: ReadonlyArray<TimelineKind>;
  counts: ReadonlyMap<TimelineKind, number>;
  total: number;
  people: ReadonlyArray<PersonOption>;
  filter: TimelineFilter;
  onChange: (next: TimelineFilter) => void;
}) {
  const allKinds = filter.kinds.length === 0;

  const toggleKind = (kind: TimelineKind) => {
    const current = allKinds ? [...kinds] : filter.kinds;
    const next = current.includes(kind)
      ? current.filter((entry) => entry !== kind)
      : [...current, kind];

    onChange({
      kinds: next.length === 0 || next.length === kinds.length ? [] : next,
      person: filter.person,
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-3 lg:flex-row lg:items-end lg:justify-between">
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Show
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {kinds.map((kind) => {
            const pressed = allKinds || filter.kinds.includes(kind);
            const count = counts.get(kind) ?? 0;

            return (
              <button
                key={kind}
                type="button"
                aria-pressed={pressed}
                onClick={() => toggleKind(kind)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-[13px] font-semibold",
                  pressed
                    ? KIND_STYLE[kind].chip
                    : "border-line-strong bg-surface-raised text-ink-muted hover:bg-surface-sunken",
                )}
              >
                {TIMELINE_KIND_LABEL[kind]}
                <span className="text-[11.5px] tabular-nums opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[12rem] flex-col gap-1">
          <Label htmlFor="timeline-person">Person</Label>
          <Select
            id="timeline-person"
            value={filter.person ?? ""}
            onChange={(event) =>
              onChange({
                kinds: filter.kinds,
                person: event.target.value === "" ? null : event.target.value,
              })
            }
          >
            <option value="">Everyone</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        </div>

        <Button
          variant="secondary"
          onClick={() => onChange({ kinds: [], person: null })}
          disabled={allKinds && filter.person === null}
        >
          Clear filters
        </Button>
      </div>

      <p className="sr-only" aria-live="polite">
        {`${total} item${total === 1 ? "" : "s"} shown.`}
      </p>
    </div>
  );
}
