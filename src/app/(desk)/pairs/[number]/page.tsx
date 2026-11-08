"use client";

import { ArrowLeft, Flag, Users } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { PairCard, PairDialog, type PairDialogTarget } from "@/components/desk";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/store/desk-store";

export default function PairPage({ params }: { params: Promise<{ number: string }> }) {
  const { number: rawNumber } = use(params);
  const number = Number.parseInt(rawNumber, 10);
  const { tournament, entries, players, days, draw, drawDay, adapters } = useDesk();
  const [pairTarget, setPairTarget] = useState<PairDialogTarget | null>(null);

  if (!tournament) return <NeedsTournament what="The pair page" />;

  const pairEntries =
    Number.isInteger(number) && number > 0
      ? entries.filter((entry) => entry.teamNo === number)
      : [];
  const day = days.find((entry) => entry.dayNumber === drawDay) ?? null;

  if (pairEntries.length === 0) {
    return (
      <div className="grid gap-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2 justify-self-start">
          <Link href="/register">
            <ArrowLeft aria-hidden="true" /> Registration desk
          </Link>
        </Button>
        <div className="card grid min-h-[240px] place-items-center text-center">
          <div className="grid justify-items-center gap-2">
            <Users className="size-6 text-ink-muted" aria-hidden="true" />
            <h1 className="text-[22px] leading-7">Pair not found</h1>
            <p className="muted">
              No player in this event carries pair {Number.isInteger(number) ? number : rawNumber}.
            </p>
            <Button variant="secondary" asChild className="mt-2">
              <Link href="/register">Back to the registration desk</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Pair"
        title={`Pair ${number}`}
        crumbs={[
          { label: tournament.name, href: "/tournaments" },
          { label: "Registration desk", href: "/register" },
          { label: `Pair ${number}` },
        ]}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href="/register">
                <ArrowLeft aria-hidden="true" /> Registration desk
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/draw">
                <Flag aria-hidden="true" /> Open the draw
              </Link>
            </Button>
          </>
        }
      >
        One member and one guest. Each player keeps their own entry, days and status, and the pair
        is kept together in the draw.
      </PageHeader>

      <PairCard
        number={number}
        entries={entries}
        players={players}
        days={days}
        onManage={setPairTarget}
      />

      <SectionCard
        id="pair-board-h"
        icon={<Flag />}
        title={day ? `${day.label} board` : "Current board"}
        subtitle="The pair on the day the desk is showing. A player who chose another day has no group here."
      >
        <div className="grid gap-2">
          {pairEntries.map((entry) => {
            const player = players.find((candidate) => candidate.id === entry.playerId);
            const group = draw?.find((candidate) => candidate.playerIds.includes(entry.playerId));
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/players/${entry.playerId}`}
                    className="font-semibold text-ink no-underline hover:underline"
                  >
                    {player?.name ?? "Unknown player"}
                  </Link>
                  <p className="hint m-0">
                    {entry.role === "member" ? "Member" : "Guest"} ·{" "}
                    {entry.status ?? "not reviewed"}
                  </p>
                </div>
                <span className={group ? "pill ok" : "pill warn"}>
                  {group
                    ? `${tournament.config.startFormat === "shotgun" ? "Hole" : "Tee"} ${group.startHole} · ${group.time}`
                    : draw
                      ? "Not in a group"
                      : "No draw yet"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="hint">
          Moving a player between groups is still done on the Draw screen. A pair split across two
          groups is a blocking issue there and stops publish.
        </p>
      </SectionCard>

      {pairTarget && (
        <PairDialog
          open={pairTarget !== null}
          onOpenChange={(open) => {
            if (!open) setPairTarget(null);
          }}
          target={pairTarget}
          tournamentId={tournament.id}
          entries={entries}
          players={players}
          onSave={(input) => adapters.pairs.save(input)}
          onSwap={(input) => adapters.pairs.swap(input)}
        />
      )}
    </div>
  );
}
