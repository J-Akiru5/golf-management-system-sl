"use client";

import { RefreshCw, Search, TriangleAlert, UserRound, Users } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
import { fmtHcp, fmtIndex, photoOf } from "@/lib/format";
import { cn } from "@/lib/ui/cn";
import { rankPlayerMatches } from "./logic";
import type { PickStatus, PlayerPickItem } from "./types";

export interface PlayerQuickPickProps {
  /** Saved players to search, already loaded by the assembler. */
  items: PlayerPickItem[];
  /** Load state: the component renders the truth for each one. Defaults to "ready". */
  status?: PickStatus;
  /** Controlled query. Leave undefined to let the component keep its own. */
  query?: string;
  onQueryChange?: (value: string) => void;
  onSelect: (item: PlayerPickItem) => void;
  /** Highlighted row, if the screen keeps a selection. */
  selectedId?: string | null;
  /** Shown with the error state, above the retry button. */
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Overrides the empty-result copy. */
  emptyMessage?: string;
  maxResults?: number;
  label?: string;
  placeholder?: string;
  hint?: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Type-to-search over saved players. Names, nicknames and NGAP ids match, ranked by how well they
 * match (exact id first, then id prefix, then name). It is a listbox + combobox pair, so the
 * keyboard drives it: arrows move, Enter confirms, Escape clears. Tablet-sized targets.
 *
 * Props-driven: it does no fetching and knows nothing about the database. The assembler supplies
 * `items` (from `PlayerRepository.search`) and receives `onSelect`.
 */
export function PlayerQuickPick({
  items,
  status = "ready",
  query: controlledQuery,
  onQueryChange,
  onSelect,
  selectedId = null,
  errorMessage,
  onRetry,
  emptyMessage,
  maxResults = 8,
  label = "Find a saved player",
  placeholder = "Name, nickname or NGAP ID",
  hint,
  disabled = false,
  autoFocus = false,
  className,
}: PlayerQuickPickProps) {
  const baseId = useId();
  const listId = `${baseId}-results`;
  const [ownQuery, setOwnQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = controlledQuery ?? ownQuery;
  const setQuery = (value: string) => {
    if (controlledQuery === undefined) setOwnQuery(value);
    onQueryChange?.(value);
  };

  const results = useMemo(
    () => rankPlayerMatches(items, query, { maxResults }),
    [items, query, maxResults],
  );
  const searching = query.trim() !== "";
  const showList = status === "ready" && results.length > 0;

  // A new query starts at the first result, and the active row is never out of range.
  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => {
    if (activeIndex > results.length - 1) setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const activeId = showList && results[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && showList) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && showList) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Home" && showList) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && showList) {
      event.preventDefault();
      setActiveIndex(results.length - 1);
      return;
    }
    if (event.key === "Enter") {
      const item = results[activeIndex];
      if (item) {
        event.preventDefault();
        onSelect(item);
      }
      return;
    }
    if (event.key === "Escape" && query !== "") {
      event.preventDefault();
      setQuery("");
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="field">
        <label htmlFor={`${baseId}-input`}>{label}</label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            id={`${baseId}-input`}
            ref={inputRef}
            type="search"
            role="combobox"
            className="!h-12 !pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            aria-expanded={showList}
            aria-controls={showList ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-describedby={hint ? `${baseId}-hint` : undefined}
            disabled={disabled}
          />
        </div>
      </div>

      {hint && (
        <p id={`${baseId}-hint`} className="hint">
          {hint}
        </p>
      )}

      {status === "loading" && (
        <p className="flex items-center gap-2 text-[14px] text-ink-muted" role="status">
          <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
          Searching saved players…
        </p>
      )}

      {status === "error" && (
        <div className="notice bad flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
          <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[14px]">
            {errorMessage?.trim() || "Could not search the player directory."}
          </span>
          {onRetry && (
            <button type="button" className="btn small" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}

      {status === "ready" && showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching saved players"
          className="grid gap-1.5 rounded-[14px] border border-line bg-surface-raised p-1.5"
        >
          {results.map((item, index) => {
            const player = item.player;
            const photo = photoOf(player);
            const selected = selectedId === player.id;
            const active = index === activeIndex;
            return (
              <li
                key={player.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                className={cn(
                  "min-h-[56px] cursor-pointer rounded-[10px] px-3 py-2",
                  active ? "bg-fairway-soft" : "hover:bg-surface-sunken",
                  selected && "border border-fairway",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onSelect(item)}
              >
                <span className="flex items-center gap-3">
                  <Avatar name={player.name} photo={photo} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <b className="truncate font-semibold text-ink">{player.name}</b>
                      {player.nickname && (
                        <span className="text-[12.5px] text-ink-muted">“{player.nickname}”</span>
                      )}
                      {item.alreadyRegistered && <span className="pill info">In this event</span>}
                    </span>
                    <span className="hint block truncate">
                      {player.ngapId ? `NGAP ${player.ngapId}` : "No NGAP ID"}
                      {player.homeCourse ? ` · ${player.homeCourse}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-[15px] font-bold text-ink tnum">
                      {fmtIndex(item.index)}
                    </span>
                    <span className="block text-[12px] text-ink-muted">
                      {item.categoryName ?? "No category"}
                      {item.playingHandicap !== null && item.playingHandicap !== undefined
                        ? ` · PH ${fmtHcp(item.playingHandicap)}`
                        : ""}
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {status === "ready" && !showList && (
        <p className="flex items-start gap-2 text-[14px] text-ink-muted" role="status">
          <UserRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {searching
              ? (emptyMessage ??
                `No saved player matches “${query.trim()}”. Check the spelling, or add them as a new player.`)
              : (emptyMessage ?? "Type a name, nickname or NGAP ID to search the directory.")}
          </span>
        </p>
      )}

      {status === "idle" && (
        <p className="flex items-start gap-2 text-[14px] text-ink-muted" role="status">
          <Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{emptyMessage ?? "Search the club directory to pick a player."}</span>
        </p>
      )}
    </div>
  );
}
