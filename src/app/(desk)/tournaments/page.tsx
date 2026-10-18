"use client";

import { CalendarRange, Flag, Plus, Printer, Settings2, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { fmtIso, fmtRange } from "@/lib/data/labels";
import { fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

/**
 * The demo's tournament list. Events are editable configuration, not hard-coded: a new one starts
 * from the current template and lives in this browser session only.
 */
export default function TournamentsPage() {
  const { tournaments, tournament, state, adapters } = useDesk();
  const [name, setName] = useState("New demo event");
  const [date, setDate] = useState("2026-12-05");

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
          <Button variant="ghost" onClick={() => adapters.tournaments.select(null)}>
            Clear selection (see the empty state)
          </Button>
        }
      >
        A demo event is a set of rules, dates and registrations. Nothing here is saved to a server,
        and the titles with a note still need the organizer's word.
      </PageHeader>

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
                  The event title is a demo sample. Confirm the real name with the organizer.
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
        title="New demo event"
        subtitle="Copies the current categories, flights and rules as a starting point. Session only."
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
          <Button
            variant="primary"
            disabled={!name.trim() || !date}
            onClick={() => adapters.tournaments.createFromTemplate(name.trim(), date)}
          >
            <Plus aria-hidden="true" /> Create
          </Button>
        </div>
        <p className="hint">
          The new event starts with no registrations and its own empty board, so the empty states
          are real rather than mocked. It is a demo record: no Supabase project is connected.
        </p>
      </SectionCard>
    </div>
  );
}
