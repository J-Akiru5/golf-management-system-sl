"use client";

import { ArrowUpRight, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import type { PairDialogTarget } from "@/components/desk/PairDialog";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { registeredDayBadges } from "@/lib/data/sessions";
import type { PlayerRecord, RegistrationEntry, TournamentDay } from "@/lib/data/types";
import { fmtHcp, fmtIndex } from "@/lib/format";
import { type PairSide, pairSlots } from "@/lib/pairs/pairs";

export interface PairCardProps {
  number: number;
  entries: readonly RegistrationEntry[];
  players: readonly PlayerRecord[];
  days: readonly TournamentDay[];
  /** Opens the shared pair drawer with the slot or the player that was clicked. */
  onManage: (target: PairDialogTarget) => void;
}

const SIDE_LABEL: Record<PairSide, string> = { member: "Member", guest: "Guest" };

/**
 * One member-guest pair, read and changed in one card. Used by the player workspace and the pair
 * page, so both show the same slots and the same actions.
 */
export function PairCard({ number, entries, players, days, onManage }: PairCardProps) {
  const slots = pairSlots(entries, number);
  const playingDays = days.filter((day) => day.isPlayingDay);
  const playerOf = (entry: RegistrationEntry | null) =>
    entry ? (players.find((player) => player.id === entry.playerId) ?? null) : null;
  const sharedClass =
    slots.member?.flightId && slots.member.flightId === slots.guest?.flightId
      ? slots.member.flightId
      : null;
  const schedulesDiffer =
    slots.member !== null &&
    slots.guest !== null &&
    JSON.stringify(slots.member.selectedDays ?? []) !==
      JSON.stringify(slots.guest.selectedDays ?? []);

  return (
    <SectionCard
      id="pair-h"
      icon={<Users />}
      title={`Pair ${number}`}
      subtitle="The member and guest play as one pair in the draw. Each player still has their own entry, days and status."
      action={
        <Button variant="secondary" size="sm" asChild>
          <Link href={`/pairs/${number}`}>
            <ArrowUpRight aria-hidden="true" /> Open pair page
          </Link>
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <SideCard
          side="guest"
          entry={slots.guest}
          player={playerOf(slots.guest)}
          playingDays={playingDays}
          onManage={onManage}
          number={number}
        />
        <SideCard
          side="member"
          entry={slots.member}
          player={playerOf(slots.member)}
          playingDays={playingDays}
          onManage={onManage}
          number={number}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sharedClass && <span className="pill info">Shared class in the draw</span>}
        {schedulesDiffer && (
          <span className="pill warn" title="They only play together on days both have selected">
            Different schedules
          </span>
        )}
        {slots.member === null && slots.guest === null && (
          <span className="hint">Both slots are empty. Assign a player to start the pair.</span>
        )}
      </div>
    </SectionCard>
  );
}

function SideCard({
  side,
  entry,
  player,
  playingDays,
  number,
  onManage,
}: {
  side: PairSide;
  entry: RegistrationEntry | null;
  player: PlayerRecord | null;
  playingDays: readonly TournamentDay[];
  number: number;
  onManage: (target: PairDialogTarget) => void;
}) {
  const days = entry ? registeredDayBadges(entry, [...playingDays]) : [];
  return (
    <section className="grid gap-2 rounded-[12px] border border-line bg-surface-raised p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="overline m-0">{SIDE_LABEL[side]}</h3>
        {entry && player && <span className="pill">{entry.status ?? "not reviewed"}</span>}
      </div>
      {entry && player ? (
        <>
          <div className="min-w-0">
            <Link
              href={`/players/${player.id}`}
              className="font-semibold text-ink no-underline hover:underline"
            >
              {player.name}
            </Link>
            <p className="hint m-0 truncate">
              {[
                player.homeCourse || null,
                entry.frozen.index != null ? `Index ${fmtIndex(entry.frozen.index)}` : null,
                entry.playingHandicap != null ? `PH ${fmtHcp(entry.playingHandicap)}` : null,
              ]
                .filter((part): part is string => Boolean(part))
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {days.length > 0 ? (
              days.map((day) => (
                <span key={day.dayNumber} className="pill">
                  {day.dayLabel} · {day.label} {day.time}
                </span>
              ))
            ) : (
              <span className="pill warn">No playing days</span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start"
            onClick={() => onManage({ number, side, entryId: entry.id, start: "menu" })}
          >
            Change pair
          </Button>
        </>
      ) : (
        <>
          <p className="hint m-0">Empty. The other player plays alone until this slot is filled.</p>
          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start"
            onClick={() => onManage({ number, side, entryId: null, start: "assign" })}
          >
            <UserPlus aria-hidden="true" /> Assign partner
          </Button>
        </>
      )}
    </section>
  );
}
