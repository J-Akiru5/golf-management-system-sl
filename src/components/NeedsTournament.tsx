"use client";

import { CalendarPlus, LoaderCircle, TriangleAlert, Trophy, UserX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { accessProblemCopy } from "@/lib/auth/access-problem";
import { useDesk } from "@/lib/store/desk-store";

/**
 * The designed empty state for pages that need an event. It says which of four things is true:
 * the desk is still loading, it failed to load, the club has no event yet, or an event just has not
 * been picked. In the demo it is reachable from the tournament selector ("Clear selection").
 */
export function NeedsTournament({ what }: { what: string }) {
  const { tournaments, adapters, status, accessProblem } = useDesk();
  const demo = status === "demo";

  // The account itself cannot use a desk. Said plainly, with no retry, because retrying cannot help
  // and a person who is told to retry will keep doing it.
  if (accessProblem) {
    const copy = accessProblemCopy(accessProblem);
    return (
      <div className="card grid min-h-[320px] place-items-center text-center" role="status">
        <div className="grid max-w-[44rem] justify-items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-fairway-soft text-fairway">
            <UserX className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-[22px] leading-7">{copy.title}</h1>
          <p className="muted">{copy.body}</p>
          <p className="muted">
            <b>What to do: </b>
            {copy.next}
          </p>
          <Button variant="secondary" asChild className="mt-1">
            <Link href="/">Club home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (status === "loading" || status === "error") {
    const failed = status === "error";
    return (
      <div className="card grid min-h-[320px] place-items-center text-center" role="status">
        <div className="grid max-w-[40rem] justify-items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-fairway-soft text-fairway">
            {failed ? (
              <TriangleAlert className="size-6 text-danger" aria-hidden="true" />
            ) : (
              <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
            )}
          </span>
          <h1 className="text-[22px] leading-7">
            {failed ? "The tournament desk did not load" : "Loading the tournament desk…"}
          </h1>
          <p className="muted">
            {failed
              ? `${what} needs the club's data, and it could not be read. Use Retry at the top of the page, or sign in again.`
              : `${what} opens as soon as the club's events and players have loaded.`}
          </p>
        </div>
      </div>
    );
  }

  const none = tournaments.length === 0;
  return (
    <div className="grid gap-6">
      <div className="card grid min-h-[320px] place-items-center text-center">
        <div className="grid max-w-[46rem] justify-items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-fairway-soft text-fairway">
            <Trophy className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-[22px] leading-7">
            {none ? "No tournament yet" : "No tournament selected"}
          </h1>
          <p className="muted">
            {none
              ? `${what} works on one event at a time, and this club has none yet. Create the first event to carry on.`
              : demo
                ? `${what} works on one event at a time. Pick an event to carry on, or make a new demo event (session only).`
                : `${what} works on one event at a time. Pick an event to carry on, or create a new one.`}
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
          <Button variant={none ? "primary" : "secondary"} asChild className="mt-1">
            <Link href="/tournaments">
              {none ? "Create the first event" : "Manage tournaments"}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
