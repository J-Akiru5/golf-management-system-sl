"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, StatusPill } from "@/components/bits";
import { fmtHcp, fmtIndex } from "@/lib/format";
import type { RegistrationStatus } from "./types";

/**
 * One player inside a member–guest team. Everything here belongs to that player alone: their own
 * index, their own playing days, their own status and their own buttons. Nothing is shared with the
 * partner, so confirming one never speaks for the other.
 */
export interface TeamPlayer {
  name: string;
  /** Data URL of the photo, already filtered by consent. */
  photo?: string;
  profileHref: string;
  status: RegistrationStatus | null;
  index: number | null;
  playingHandicap: number | null;
  flightName: string | null;
  /** One label per playing day, e.g. "Day 3 AM". Empty when no day is selected. */
  days: string[];
  /** Shirt size and requested start, on one line. */
  note: string | null;
  /** The facts the entry was confirmed without. Shown as the provisional warning. */
  missing: string[];
  overridden?: boolean;
  overrideReason?: string | null;
  /** The desk's buttons for this player, supplied by the screen. */
  actions: ReactNode;
}

export interface RegistrationTeamProps {
  /** The club sheet's pair number, or null for a player entered on their own. */
  number: number | null;
  /** Left column. A pair with no guest yet shows the gap on purpose. */
  guest: TeamPlayer | null;
  /** Right column. */
  member: TeamPlayer | null;
}

/** `Index 19.9 · PH 21 · Class B`, minus whatever is not known. Never an invented value. */
function metaLine(player: TeamPlayer): string {
  return [
    player.index !== null ? `Index ${fmtIndex(player.index)}` : "No index on file",
    player.playingHandicap !== null ? `PH ${fmtHcp(player.playingHandicap)}` : null,
    player.flightName,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * One member–guest team: the guest on the left, the member on the right, each with a titled column,
 * their schedule under their name, then their status and their actions. The pair is the unit the
 * desk works with, so the two players sit side by side instead of as two unrelated rows.
 */
export function RegistrationTeam({ number, guest, member }: RegistrationTeamProps) {
  const entered = (guest ? 1 : 0) + (member ? 1 : 0);
  // A pair is classed on the average of its two indexes, so both partners normally share one class.
  // Showing it on the pair makes the rule visible instead of leaving it to be read off each player.
  const sharedClass =
    guest?.flightName && member?.flightName && guest.flightName === member.flightName
      ? guest.flightName
      : null;
  return (
    <article className="overflow-hidden rounded-[14px] border border-line bg-surface-raised">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-surface-sunken/60 px-3.5 py-2">
        {number !== null ? (
          <span className="pill gold">Pair {number}</span>
        ) : (
          <span className="pill">Individual entry</span>
        )}
        {sharedClass && (
          <span
            className="pill info"
            title="Both partners take the class that covers the average of their indexes"
          >
            {sharedClass}
          </span>
        )}
        <span className="text-[12.5px] text-ink-muted">
          {entered === 2
            ? "Member and guest, kept together in the draw"
            : number !== null
              ? "Partner not entered"
              : "No member–guest partner on the club sheet"}
        </span>
        <span className="tnum ml-auto text-[12px] text-ink-muted">{entered}/2</span>
      </header>
      <div className="grid gap-px bg-line md:grid-cols-2">
        <TeamColumn side="guest" player={guest} />
        <TeamColumn side="member" player={member} />
      </div>
    </article>
  );
}

function TeamColumn({ side, player }: { side: "guest" | "member"; player: TeamPlayer | null }) {
  const title = side === "guest" ? "Guest" : "Member";
  return (
    <section aria-label={title} className="min-w-0 bg-surface-raised p-3.5">
      <h3 className="overline m-0">{title}</h3>
      {player ? (
        <>
          <div className="mt-1.5 flex min-w-0 items-start gap-2.5">
            <Avatar name={player.name} photo={player.photo} />
            <div className="min-w-0 flex-1">
              <Link
                href={player.profileHref}
                className="block truncate font-semibold text-ink no-underline hover:underline"
              >
                {player.name}
              </Link>
              <span className="hint block truncate">{metaLine(player)}</span>
            </div>
            {player.overridden && (
              <span
                className="pill gold shrink-0"
                title={
                  player.overrideReason ? `Changed by hand: ${player.overrideReason}` : undefined
                }
              >
                Overridden
              </span>
            )}
          </div>

          <dl className="mt-2.5 grid gap-1.5 rounded-[10px] bg-surface-sunken px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <dt className="overline !text-[10px]">Schedule</dt>
              <dd className="m-0 flex flex-wrap gap-1">
                {player.days.length > 0 ? (
                  player.days.map((day) => (
                    <span key={day} className="pill">
                      {day}
                    </span>
                  ))
                ) : (
                  <span className="pill warn">No playing days</span>
                )}
              </dd>
            </div>
            {player.note && (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <dt className="overline !text-[10px]">Entry</dt>
                <dd className="hint m-0">{player.note}</dd>
              </div>
            )}
          </dl>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {player.status ? (
              <StatusPill status={player.status} />
            ) : (
              <span className="pill">Not entered</span>
            )}
            {player.missing.length > 0 && (
              <span
                className="pill warn"
                title={`Confirmed without ${player.missing.join(", ")}. Correct it on the player record, then re-freeze or re-run the draw.`}
              >
                Provisional · missing {player.missing.join(", ")}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">{player.actions}</div>
        </>
      ) : (
        <p className="hint mt-1.5">
          {side === "guest"
            ? "No guest entered for this pair. The member plays alone until one is added."
            : "No member entered for this pair yet."}
        </p>
      )}
    </section>
  );
}
