"use client";

import { Search } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  type CardQueueCounts,
  type CardQueueEntry,
  type CardQueueFilters,
  type CardQueueState,
} from "@/lib/scoring/card-queue";

export interface CardQueueDayOption {
  value: number;
  label: string;
}

export interface CardQueueClassOption {
  value: string;
  label: string;
}

export interface CardQueuePanelProps {
  /** The cards that match the search and the state filter, in paper-pile order. */
  entries: readonly CardQueueEntry[];
  /** What the day and session scope holds, so the desk sees what is still missing. */
  counts: CardQueueCounts;
  /** The scope in words, after the count: "in Day 3 · AM session". */
  scopeLabel: string;
  dayNumber: number | null;
  dayOptions: readonly CardQueueDayOption[];
  classOptions: readonly CardQueueClassOption[];
  filters: CardQueueFilters;
  currentPlayerId: string;
  onFiltersChange: (next: CardQueueFilters) => void;
  onDayChange: (dayNumber: number) => void;
  /** A real selection: the chosen player's card opens in the workspace. Never a navigation. */
  onSelect: (playerId: string) => void;
}

const STATE_LABEL: Record<CardQueueState, string> = {
  none: "No card",
  entered: "Entered",
  verified: "Verified",
};

const STATE_TONE: Record<CardQueueState, string> = {
  none: "warn",
  entered: "info",
  verified: "ok",
};

/** The group the desk follows on the paper pile: group number, then the hole it starts on. */
function groupText(entry: CardQueueEntry): string {
  if (entry.groupNumber === null) {
    return entry.startHole === null ? "" : `Starts hole ${entry.startHole}`;
  }
  return entry.startHole === null
    ? `Group ${entry.groupNumber}`
    : `Group ${entry.groupNumber} · hole ${entry.startHole}`;
}

function readSession(value: string): CardQueueFilters["session"] {
  return value === "AM" || value === "PM" ? value : "all";
}

function readState(value: string): CardQueueFilters["state"] {
  return value === "none" || value === "entered" || value === "verified" ? value : "all";
}

/**
 * The desk's way into a card: a name search, the day, session, class and card state, the count of
 * what is still missing, and the list of cards in the paper-pile order the group tees off in.
 *
 * It only selects a player. The workspace below it owns the card, the scores and the save.
 */
export function CardQueuePanel({
  entries,
  counts,
  scopeLabel,
  dayNumber,
  dayOptions,
  classOptions,
  filters,
  currentPlayerId,
  onFiltersChange,
  onDayChange,
  onSelect,
}: CardQueuePanelProps) {
  const listRef = useRef<HTMLUListElement>(null);

  function rowButtons(): HTMLButtonElement[] {
    return Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-card-row]") ?? [],
    );
  }

  function focusRow(index: number) {
    rowButtons()[index]?.focus();
  }

  function moveRowFocus(event: KeyboardEvent<HTMLButtonElement>, direction: 1 | -1) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = rowButtons();
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    buttons[index + direction]?.focus();
  }

  function clearFilters() {
    onFiltersChange({ session: "all", classKey: null, state: "all", query: "" });
  }

  const firstEntry = entries[0] ?? null;

  return (
    <section className="card grid gap-3" aria-labelledby="card-queue">
      <div>
        <h2 id="card-queue" className="text-[18px] font-bold text-ink">
          Find a card
        </h2>
        <p className="hint m-0" id="card-queue-hint">
          Type a name, pick the card, then type the 18 scores. Tab or Enter moves to the next hole,
          and Save and next opens the next card and puts the keyboard on its first field.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <label className="field sm:col-span-2">
          <span>Player search</span>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              className="!pl-9"
              value={filters.query}
              onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && firstEntry) {
                  event.preventDefault();
                  onSelect(firstEntry.playerId);
                  return;
                }
                if (event.key === "ArrowDown" && entries.length > 0) {
                  event.preventDefault();
                  focusRow(0);
                }
              }}
              placeholder="Surname or given name, any order"
              autoComplete="off"
              aria-describedby="card-queue-hint"
            />
          </div>
        </label>

        {dayOptions.length > 0 && (
          <label className="field">
            <span>Day</span>
            <select
              value={dayNumber === null ? "" : String(dayNumber)}
              onChange={(event) => {
                if (event.target.value === "") return;
                onDayChange(Number(event.target.value));
              }}
            >
              {dayNumber === null && <option value="">Pick a day</option>}
              {dayOptions.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>Session</span>
          <select
            value={filters.session}
            onChange={(event) =>
              onFiltersChange({ ...filters, session: readSession(event.target.value) })
            }
          >
            <option value="all">All sessions</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </label>

        <label className="field">
          <span>Class</span>
          <select
            value={filters.classKey ?? ""}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                classKey: event.target.value === "" ? null : event.target.value,
              })
            }
          >
            <option value="">All classes</option>
            {classOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Card state</span>
          <select
            value={filters.state}
            onChange={(event) =>
              onFiltersChange({ ...filters, state: readState(event.target.value) })
            }
          >
            <option value="all">Any state</option>
            <option value="none">No card</option>
            <option value="entered">Entered</option>
            <option value="verified">Verified</option>
          </select>
        </label>
      </div>

      <section className="tiles" aria-label="Cards for this session">
        <div className="tile">
          <b className="mono">{counts.entered}</b>
          <span>Cards entered</span>
        </div>
        <div className="tile">
          <b className="mono">{counts.verified}</b>
          <span>Verified</span>
        </div>
        <div className="tile">
          <b className="mono">{counts.missing}</b>
          <span>Still missing</span>
        </div>
      </section>
      <p className="muted m-0 text-[13px]" role="status">
        {counts.total} {counts.total === 1 ? "player" : "players"} {scopeLabel}.
      </p>

      {entries.length === 0 ? (
        <div className="grid justify-items-start gap-2">
          <p className="muted m-0">No card matches those filters.</p>
          <Button variant="secondary" size="sm" className="min-h-11" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <ul
          ref={listRef}
          aria-label="Cards to enter"
          className="grid max-h-80 gap-1.5 overflow-y-auto pr-1"
        >
          {entries.map((entry) => {
            const current = entry.playerId === currentPlayerId;
            const details = [entry.className ?? "", groupText(entry), entry.teeTime ?? ""].filter(
              (part) => part !== "",
            );
            return (
              <li key={entry.playerId}>
                <button
                  type="button"
                  data-card-row={entry.playerId}
                  aria-pressed={current}
                  onClick={() => onSelect(entry.playerId)}
                  onKeyDown={(event) => moveRowFocus(event, event.key === "ArrowUp" ? -1 : 1)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-md border px-2.5 py-1.5 text-left ${
                    current
                      ? "border-primary bg-fairway-soft"
                      : "border-line bg-surface-raised hover:bg-surface-sunken"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">
                      {entry.playerName}
                    </span>
                    {details.length > 0 && (
                      <span className="block truncate text-[12px] text-ink-muted">
                        {details.join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className={`pill ${STATE_TONE[entry.state]}`}>
                    {STATE_LABEL[entry.state]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
