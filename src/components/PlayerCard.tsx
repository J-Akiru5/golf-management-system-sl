import Link from "next/link";
import type { ReactNode } from "react";
import type { DeskPlayer } from "@/lib/demo/data";
import { fmtHcp, fmtIndex, photoOf } from "@/lib/format";
import type { Registration } from "@/lib/routing";
import { Avatar, StatusPill } from "./bits";

interface Names {
  category: (id: string | null) => string;
  flight: (id: string | null) => string;
  tee: (id: string | null) => string;
}

/**
 * One consistent player card for the directory, the draw and the profile page.
 * Handicap Index (from NGAP) and playing handicap (worked out for the tee) are always labelled
 * apart, because mixing them up is the commonest scoring mistake on the day.
 */
export function PlayerCard({
  player,
  reg,
  names,
  profileLink = true,
  children,
}: {
  player: DeskPlayer;
  reg: Registration;
  names: Names;
  profileLink?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="pcard">
      <div className="who">
        <Avatar name={player.name} photo={photoOf(player)} large />
        <div className="stack tight">
          <h3>{player.name}</h3>
          <span className="muted">
            {names.category(reg.categoryId)} · age {reg.age}
          </span>
          <StatusPill status={reg.status} />
        </div>
      </div>
      <dl className="facts">
        <div>
          <dt>Handicap Index</dt>
          <dd className="mono">{fmtIndex(player.index)}</dd>
        </div>
        <div>
          <dt>Playing handicap{reg.teeId ? ` (${names.tee(reg.teeId)} tee)` : ""}</dt>
          <dd className="mono">{fmtHcp(reg.playingHandicap)}</dd>
        </div>
        <div>
          <dt>Flight</dt>
          <dd>{names.flight(reg.flightId)}</dd>
        </div>
      </dl>
      {reg.reasons.length > 0 && <p className="hint">{reg.reasons.join(" ")}</p>}
      {(profileLink || children) && (
        <div className="row">
          {profileLink && (
            <Link className="btn small ghost" href={`/players/${player.id}`}>
              Open profile
            </Link>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
