"use client";

import type { DeskRegistration, PlayerRecord } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";

/**
 * Print-ready start sheet: one block per group, in play order. Organizer use on paper; it carries
 * names and playing handicaps only (no contact details, birthdates or notes).
 */
export function StartSheet({
  title,
  subtitle,
  groups,
  players,
  regs,
  shotgun,
  flightName,
}: {
  title: string;
  subtitle: string;
  groups: DrawGroup[];
  players: Map<string, PlayerRecord>;
  regs: Map<string, DeskRegistration>;
  shotgun: boolean;
  flightName: (id: string | null) => string;
}) {
  const sections = new Map<string, DrawGroup[]>();
  for (const g of groups) {
    if (g.playerIds.length === 0) continue;
    const key = shotgun ? `Wave ${g.wave} · ${fmtTime(g.time)}` : fmtTime(g.time);
    sections.set(key, [...(sections.get(key) ?? []), g]);
  }

  return (
    <div className="print-sheet grid gap-4">
      <header className="grid gap-1 border-b-2 border-line pb-3">
        <h2 className="text-[22px] leading-7">{title}</h2>
        <p className="hint">{subtitle}</p>
      </header>

      {[...sections.entries()].map(([heading, list]) => (
        <section key={heading} className="grid gap-3">
          <h3 className="flex items-center gap-3 text-[16px]">
            {heading}
            <span className="hint">
              {list.length} groups · {list.reduce((n, g) => n + g.playerIds.length, 0)} players
            </span>
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((g) => (
              <article key={g.number} className="print-block card !p-3">
                <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                  <b className="font-display text-[15px]">
                    {shotgun ? `Hole ${g.startHole}${g.wave ?? ""}` : `Tee ${g.startHole}`} · Group{" "}
                    {g.number}
                  </b>
                  <span className="mono text-[13px]">{fmtTime(g.time)}</span>
                </div>
                <p className="hint mt-1">{flightName(g.flightId)}</p>
                <ol className="plain mt-2 grid gap-1">
                  {g.playerIds.map((id) => {
                    const p = players.get(id);
                    const r = regs.get(id);
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-2 border-b border-line py-1 text-[13px] last:border-b-0"
                      >
                        <span className="min-w-0 truncate">{p?.name ?? "Unknown player"}</span>
                        <span className="flex shrink-0 gap-2 text-[12px]">
                          <span title="Handicap Index">HI {fmtIndex(r?.frozenIndex ?? null)}</span>
                          <b title="Playing handicap">PH {fmtHcp(r?.playingHandicap ?? null)}</b>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </article>
            ))}
          </div>
        </section>
      ))}
      {sections.size === 0 && <p>No groups to print yet.</p>}
      <p className="print-note">
        Printed from the tournament desk demo. Tee ratings are sample values, not IGCC scorecard
        data. Confirm the real start sheet with the club before the event.
      </p>
    </div>
  );
}
