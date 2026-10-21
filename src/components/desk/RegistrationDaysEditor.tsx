"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { daySelectionProblem } from "@/lib/data/day-selection";
import { fmtIso } from "@/lib/data/labels";
import type { RegistrationEntry, TournamentDay } from "@/lib/data/types";

/**
 * Day selection for one registration. The operator can change several days before saving, which
 * matters when the event requires exactly N days: checking one day off and another on has to be one
 * edit, not two writes that each break the rule.
 */
export function RegistrationDaysEditor({
  entry,
  days,
  required,
  max,
  onSave,
}: {
  entry: RegistrationEntry;
  days: TournamentDay[];
  required: number | null | undefined;
  max: number | null | undefined;
  onSave: (days: number[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>(entry.selectedDays ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setSelected(entry.selectedDays ?? []);
          setError("");
          setOpen(true);
        }}
      >
        Days
      </Button>
    );
  }

  return (
    <span className="grid w-full gap-2 rounded-[10px] border border-line bg-surface-sunken p-2 sm:w-auto">
      <span className="grid gap-1">
        {days.map((day) => {
          const checked = selected.includes(day.dayNumber);
          return (
            <label key={day.id} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={checked}
                disabled={saving}
                onChange={() =>
                  setSelected((current) =>
                    checked
                      ? current.filter((n) => n !== day.dayNumber)
                      : [...current, day.dayNumber].sort((a, b) => a - b),
                  )
                }
              />
              <span>
                {day.label} · {fmtIso(day.playDate)}
              </span>
            </label>
          );
        })}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          onClick={async () => {
            setError("");
            const problem = daySelectionProblem(selected, required ?? null, max ?? null);
            if (problem === "required") {
              setError(`This event requires exactly ${required} day(s).`);
              return;
            }
            if (problem === "maximum") {
              setError(`This event allows at most ${max} day(s).`);
              return;
            }
            setSaving(true);
            try {
              await onSave(selected);
              setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save the days.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <Check aria-hidden="true" /> {saving ? "Saving…" : "Save days"}
        </Button>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => setOpen(false)}>
          <X aria-hidden="true" /> Cancel
        </Button>
      </span>
      {error && (
        <span className="hint !text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
