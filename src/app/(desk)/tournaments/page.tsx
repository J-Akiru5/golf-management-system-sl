"use client";

import { CalendarRange, Flag, Plus, Printer, Settings2, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RoleGate } from "@/components/desk";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { fmtIso, fmtRange } from "@/lib/data/labels";
import { fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

/**
 * The tournament list. Events are editable configuration, not hard-coded: a new one starts from the
 * current event (or, for a club with none, the starter categories) and is saved to the club
 * database. In the demo build it lives in this browser session only.
 */
export default function TournamentsPage() {
  const { tournaments, tournament, state, adapters, status, member } = useDesk();
  const connected = status !== "demo";
  const [name, setName] = useState(connected ? "" : "New demo event");
  const [date, setDate] = useState(() =>
    connected ? new Date().toISOString().slice(0, 10) : "2026-12-05",
  );

  const entryCount = (id: string) => state.entries.filter((e) => e.tournamentId === id).length;
  const boardState = (id: string) => {
    const board = state.boards[id];
    if (!board?.draw) return "No draw yet";
    return board.published ? "Published" : "Draft";
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Events"
        title="Tournaments"
        crumbs={[{ label: "Tournament office", href: "/" }, { label: "Tournaments" }]}
        actions={
          connected ? undefined : (
            <Button variant="ghost" onClick={() => adapters.tournaments.select(null)}>
              Clear selection (see the empty state)
            </Button>
          )
        }
      >
        An event is a set of rules, dates and registrations.{" "}
        {connected
          ? "Events are saved to the club database."
          : "Nothing here is saved to a server."}{" "}
        Titles with a note still need the organizer&rsquo;s word.
      </PageHeader>

      {tournaments.length === 0 && (
        <div className="card flex items-start gap-3">
          <Trophy className="mt-0.5 size-5 shrink-0 text-fairway" aria-hidden="true" />
          <p className="text-[14px]">
            <b>
              {status === "loading"
                ? "Loading the club's events…"
                : status === "error"
                  ? "The events could not be loaded."
                  : "There are no events yet."}
            </b>{" "}
            {status === "ready" &&
              "Create the first one below. It starts from the starter categories and tees, which are samples until you enter the club scorecard in Settings."}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {tournaments.map((t) => {
          const active = t.id === tournament?.id;
          return (
            <article
              key={t.id}
              className={cn("card grid gap-4", active && "border-fairway shadow-lift")}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-[10px]",
                    active ? "bg-gold text-on-gold" : "bg-fairway-soft text-fairway",
                  )}
                >
                  <Trophy className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[19px] leading-6">{t.name}</h2>
                  <p className="hint mt-0.5 flex flex-wrap items-center gap-x-2">
                    <CalendarRange className="size-3.5" aria-hidden="true" />
                    {fmtRange(t.dates)} ·{" "}
                    {t.config.startFormat === "shotgun" ? "Shotgun" : "Two-tee"} ·{" "}
                    {fmtTime(t.config.firstTeeTime)} · cut-off {fmtIso(t.cutOffDate)}
                  </p>
                </div>
                {active && <span className="pill gold">Working on this event</span>}
              </div>
              {t.nameNeedsConfirmation && (
                <p className="notice warn !py-2 text-[13px]">
                  The event name has not been confirmed. Check it with the organizer, then clear the
                  note in Settings.
                </p>
              )}
              <dl className="m-0 grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-line bg-line">
                {[
                  { label: "Registrations", value: String(entryCount(t.id)) },
                  { label: "Draw", value: boardState(t.id) },
                  { label: "State", value: t.state },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="grid content-start gap-0.5 bg-surface-raised px-3 py-2.5"
                  >
                    <dt className="text-[10.5px] leading-4 font-semibold tracking-[.08em] text-ink-muted uppercase">
                      {f.label}
                    </dt>
                    <dd className="m-0 font-semibold">{f.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2">
                {!active && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => adapters.tournaments.select(t.id)}
                  >
                    Work on this event
                  </Button>
                )}
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/setup">
                    <Settings2 aria-hidden="true" /> Setup
                  </Link>
                </Button>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/register">Registration desk</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/draw">
                    <Flag aria-hidden="true" /> Draw
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/print">
                    <Printer aria-hidden="true" /> Print
                  </Link>
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <SectionCard
        id="new-h"
        icon={<Plus />}
        title={connected ? "New event" : "New demo event"}
        subtitle={
          connected
            ? "Copies the current categories, flights and rules as a starting point, and saves the event."
            : "Copies the current categories, flights and rules as a starting point. Session only."
        }
      >
        <div className="grid items-end gap-3.5 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
          <label className="field">
            <span>Event name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Date of play</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <RoleGate
            role={member?.role}
            allow={["owner", "organizer"]}
            mode="disable"
            disabledReason="Only the owner or an organizer can create an event."
          >
            <Button
              variant="primary"
              disabled={!name.trim() || !date || status === "loading" || status === "error"}
              onClick={() => adapters.tournaments.createFromTemplate(name.trim(), date)}
            >
              <Plus aria-hidden="true" /> Create
            </Button>
          </RoleGate>
        </div>
        <p className="hint">
          The new event starts with no registrations and its own empty board.{" "}
          {connected
            ? "It is written to the club database, then the desk reloads to read it back."
            : "It is a demo record: no Supabase project is connected."}
        </p>
      </SectionCard>
    </div>
  );
}
