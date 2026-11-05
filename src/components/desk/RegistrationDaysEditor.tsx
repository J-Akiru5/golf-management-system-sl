"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type DaySessionChoice,
  daySelectionProblem,
  pruneDaySessions,
} from "@/lib/data/day-selection";
import { fmtIso } from "@/lib/data/labels";
import { daySessionSummary, daySessions, sessionLabelForTime } from "@/lib/data/sessions";
import type { RegistrationEntry, TournamentDay } from "@/lib/data/types";
import { cn } from "@/lib/ui/cn";

/**
 * Day selection for one registration. The operator can change several days before saving, which
 * matters when the event requires exactly N days: checking one day off and another on has to be one
 * edit, not two writes that each break the rule.
 *
 * Each selected day also carries its session. Every day runs a morning and an afternoon tee time, so
 * the desk marks the one this player is in. The days and their sessions go in one save, so the row
 * and the database never disagree about which morning a player is in.
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
  onSave: (days: number[], sessions: Record<number, DaySessionChoice>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>(entry.selectedDays ?? []);
  const [sessions, setSessions] = useState<Record<number, DaySessionChoice>>(
    () => entry.daySessions ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setSelected(entry.selectedDays ?? []);
          setSessions(entry.daySessions ?? {});
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
        {days.map((day, index) => {
          const checked = selected.includes(day.dayNumber);
          // The stored session wins; an assigned tee time answers for a day the desk has not marked.
          const picked =
            sessions[day.dayNumber] ??
            sessionLabelForTime(entry.dayTee?.[day.dayNumber]?.teeTime ?? null, index, days.length);
          const options = daySessions(index, days.length);
          return (
            <span key={day.id} className="grid gap-1">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={() => {
                    setSessions((current) => {
                      const next = { ...current };
                      delete next[day.dayNumber];
                      return next;
                    });
                    setSelected((current) =>
                      checked
                        ? current.filter((n) => n !== day.dayNumber)
                        : [...current, day.dayNumber].sort((a, b) => a - b),
                    );
                  }}
                />
                <span>
                  {day.label} · {fmtIso(day.playDate)}
                  <span className="hint block">{daySessionSummary(index, days.length)}</span>
                </span>
              </label>
              {checked && (
                <span
                  className="flex flex-wrap gap-1 pl-6"
                  role="group"
                  aria-label={`Session for ${day.label}`}
                >
                  {options.map((session) => (
                    <button
                      key={session.key}
                      type="button"
                      className={cn("btn small", picked === session.key ? "gold" : "ghost")}
                      aria-pressed={picked === session.key}
                      disabled={saving}
                      onClick={() =>
                        setSessions((current) => ({
                          ...current,
                          [day.dayNumber]: session.key,
                        }))
                      }
                    >
                      {session.label} · {session.time}
                    </button>
                  ))}
                  {!picked && <span className="hint self-center">Pick AM or PM for this day.</span>}
                </span>
              )}
            </span>
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
              await onSave(selected, pruneDaySessions(selected, sessions, days.length));
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
