"use client";

import { CalendarPlus, Trophy } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/store/desk-store";

/**
 * The designed empty state for pages that need an event. It is reachable from the tournament
 * selector ("Clear selection"), so nobody has to guess what the desk looks like with no event.
 */
export function NeedsTournament({ what }: { what: string }) {
  const { tournaments, adapters } = useDesk();
  return (
    <div className="grid gap-6">
      <div className="card grid min-h-[320px] place-items-center text-center">
        <div className="grid max-w-[46rem] justify-items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-fairway-soft text-fairway">
            <Trophy className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-[22px] leading-7">No tournament selected</h1>
          <p className="muted">
            {what} works on one event at a time. Pick an event to carry on, or make a new demo event
            (session only).
          </p>
          <ul className="grid w-full gap-2 text-left">
            {tournaments.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => adapters.tournaments.select(t.id)}
                  className="card flex w-full items-center gap-3 !p-3 text-left hover:bg-surface-sunken"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fairway-soft text-fairway">
                    <CalendarPlus className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate">{t.name}</b>
                    <span className="hint">
                      {t.dates[0]} · {t.config.startFormat === "shotgun" ? "shotgun" : "two-tee"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="secondary" asChild className="mt-1">
            <Link href="/tournaments">Manage tournaments</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
