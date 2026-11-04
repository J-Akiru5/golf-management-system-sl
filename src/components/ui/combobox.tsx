"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/ui/cn";
import { DEFAULT_RESULT_LIMIT, type FilterableOption, filterOptions } from "@/lib/ui/combobox";

export interface ComboboxProps {
  /** The visible field label. */
  label: string;
  value: string;
  options: readonly FilterableOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  /** Shown when the query matches nothing. */
  emptyMessage?: string;
  /** How many rows are drawn at once; the rest are reached by typing. */
  limit?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * A player field that can be typed into.
 *
 * It looks like the old dropdown until it is touched, then it is a searchable list: names, and the
 * secondary line (NGAP id, home course), are matched as you type. Arrows move, Enter picks, Escape
 * closes and keeps the current player. With more than `limit` matches it says how many there are
 * and draws the first `limit`, so a hundred-player field stays fast to open.
 *
 * The list is drawn inline under the field rather than in a portal: inside a card it must not float
 * over the page, and the field is short enough that the list never needs to escape its section.
 */
export function Combobox({
  label,
  value,
  options,
  onChange,
  placeholder = "Type a name",
  emptyMessage,
  limit = DEFAULT_RESULT_LIMIT,
  disabled = false,
  className,
}: ComboboxProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.id === value) ?? null;
  const { results, total } = useMemo(
    () => filterOptions(options, open ? query : "", limit),
    [options, open, query, limit],
  );

  useEffect(() => setActiveIndex(0), [query, open]);
  useEffect(() => {
    if (activeIndex > results.length - 1) setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
  };
  const closeList = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (id: string) => {
    onChange(id);
    closeList();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      const option = results[activeIndex];
      if (open && option) {
        event.preventDefault();
        choose(option.id);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeList();
      inputRef.current?.blur();
    }
  };

  const activeId = open && results[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  return (
    <div className={cn("field", className)}>
      <label htmlFor={inputId}>{label}</label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          className="!pl-9 !pr-10"
          value={open ? query : (selected?.label ?? "")}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={openList}
          onBlur={closeList}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          disabled={disabled}
        />
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        {open && (
          <div className="absolute top-[calc(100%+6px)] right-0 left-0 z-40 overflow-hidden rounded-[12px] border border-line bg-surface-raised shadow-lift">
            {results.length > 0 ? (
              <ul
                id={listId}
                role="listbox"
                aria-label={label}
                className="max-h-64 overflow-y-auto p-1.5"
              >
                {results.map((option, index) => {
                  const isSelected = option.id === value;
                  const isActive = index === activeIndex;
                  return (
                    <li
                      key={option.id}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2",
                        isActive ? "bg-fairway-soft" : "hover:bg-surface-sunken",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(option.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          choose(option.id);
                        }
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">
                          {option.label}
                        </span>
                        {option.hint && (
                          <span className="block truncate text-[12px] text-ink-muted">
                            {option.hint}
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <Check className="size-4 shrink-0 text-fairway" aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="p-3 text-[13px] text-ink-muted" role="status">
                {emptyMessage ??
                  (query.trim()
                    ? `No player matches “${query.trim()}”.`
                    : "No players are available yet.")}
              </p>
            )}
            {total > results.length && (
              <p className="border-t border-line px-3 py-2 text-[12px] text-ink-muted">
                Showing {results.length} of {total}. Keep typing to narrow it down.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
