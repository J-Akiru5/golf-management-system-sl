"use client";

import { CalendarRange, Check, ChevronDown, Flag, Trophy } from "lucide-react";
import Link from "next/link";
import { fmtRange } from "@/lib/data/labels";
import { fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/**
 * The current-tournament selector in the top bar. It is the switch between demo events, and it can
 * clear the selection so the no-tournament empty state is reachable.
 */
export function TournamentSelect({ overlay }: { overlay: boolean }) {
  const { tournaments, tournament, entries, adapters } = useDesk();
  const startLabel = tournament
    ? tournament.config.startFormat === "shotgun"
      ? `Shotgun · ${fmtTime(tournament.config.firstTeeTime)}`
      : `Two-tee · ${fmtTime(tournament.config.firstTeeTime)}`
    : "No event selected";

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "hidden h-12 min-w-0 items-center gap-2.5 rounded-full py-0 pr-3 pl-2 text-[13px] text-ink xl:flex",
          overlay ? "glass" : "border border-[rgba(238,240,234,0.18)] bg-[rgba(0,0,0,0.12)]",
        )}
        aria-label="Current tournament"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold text-on-gold">
          <Flag className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 text-left">
          <b className="block max-w-[220px] truncate font-display">
            {tournament ? tournament.name : "No tournament selected"}
          </b>
          <span className="block text-[11px] text-ink-muted tnum">{startLabel}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,calc(100vw-24px))] p-0">
        <div className="border-b border-line px-4 py-3">
          <p className="overline">Current tournament</p>
          <p className="hint mt-0.5">
            Switching events switches the board. Nothing is saved; this demo lives in the browser
            session only.
          </p>
        </div>
        <ul className="grid max-h-[50vh] overflow-y-auto p-2">
          {tournaments.map((t) => {
            const on = t.id === tournament?.id;
            const count = t.id === tournament?.id ? entries.length : undefined;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => adapters.tournaments.select(t.id)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left",
                    on ? "bg-fairway-soft" : "hover:bg-surface-sunken",
                  )}
                >
                  <Trophy
                    className={cn("mt-0.5 size-4 shrink-0", on ? "text-fairway" : "text-ink-muted")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px]">{t.name}</b>
                    <span className="hint flex items-center gap-1.5">
                      <CalendarRange className="size-3.5" aria-hidden="true" />
                      {fmtRange(t.dates)}
                      {count !== undefined
                        ? ` · ${count} registration${count === 1 ? "" : "s"}`
                        : ""}
                    </span>
                    {t.nameNeedsConfirmation && (
                      <span className="hint block !text-warning">
                        Sample name, needs organizer confirmation
                      </span>
                    )}
                  </span>
                  {on && <Check className="mt-1 size-4 shrink-0 text-fairway" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
          <button
            type="button"
            className="btn small ghost"
            onClick={() => adapters.tournaments.select(null)}
            disabled={tournament === null}
          >
            Clear selection
          </button>
          <Link href="/tournaments" className="btn small ghost">
            Manage tournaments
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
