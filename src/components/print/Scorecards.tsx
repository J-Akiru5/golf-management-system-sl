"use client";

import type { DeskRegistration, Hole, PlayerRecord } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";

/**
 * Scorecard shell for paper cards. The hole grid and the player lines are real; par, stroke index
 * and the handicap dot are placeholders until the club's scorecard data is entered, and the card
 * says so on its face. Scores are written by hand: this version does not encode results.
 */
export function Scorecards({
  title,
  subtitle,
  groups,
  players,
  regs,
  holes,
  shotgun,
  flightName,
}: {
  title: string;
  subtitle: string;
  groups: DrawGroup[];
  players: Map<string, PlayerRecord>;
  regs: Map<string, DeskRegistration>;
  holes: Hole[];
  shotgun: boolean;
  flightName: (id: string | null) => string;
}) {
  const withPlayers = groups.filter((g) => g.playerIds.length > 0);
  const front = holes.filter((h) => h.number <= 9);
  const back = holes.filter((h) => h.number > 9);

  const nine = (title2: string, list: Hole[], g: DrawGroup) => (
    <table className="print-table">
      <caption className="text-left text-[10pt] font-semibold">{title2}</caption>
      <thead>
        <tr>
          <th scope="col">Hole</th>
          {list.map((h) => (
            <th key={h.id} scope="col" className="text-center">
              {h.number}
            </th>
          ))}
          <th scope="col">Out/In</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Par</th>
          {list.map((h) => (
            <td key={h.id} className="text-center">
              {h.par ?? "—"}
            </td>
          ))}
          <td className="text-center">—</td>
        </tr>
        <tr>
          <th scope="row" title="Stroke index">
            S.I.
          </th>
          {list.map((h) => (
            <td key={h.id} className="text-center">
              {h.strokeIndex ?? "•"}
            </td>
          ))}
          <td className="text-center">—</td>
        </tr>
        {g.playerIds.map((id) => {
          const p = players.get(id);
          const r = regs.get(id);
          return (
            <tr key={id}>
              <th scope="row" className="whitespace-nowrap">
                {p?.name ?? "Unknown"}{" "}
                <span className="font-normal">({fmtHcp(r?.playingHandicap ?? null)})</span>
              </th>
              {list.map((h) => (
                <td key={h.id} className="text-center">
                  &nbsp;
                </td>
              ))}
              <td className="text-center"> </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="print-sheet grid gap-4">
      <header className="grid gap-1 border-b-2 border-line pb-3">
        <h2 className="text-[22px] leading-7">{title}</h2>
        <p className="hint">{subtitle}</p>
      </header>

      <p className="print-note notice !py-2 text-[12px]" role="note">
        <b>Placeholder card.</b> Par and stroke index are not entered yet, so the dot column shows •
        and the cells are blank for hand scoring. The handicap dot on a real card comes from the
        club's stroke index, which is pending. This demo does not encode scores or results.
      </p>

      <div className="print-scorecards">
        {withPlayers.map((g) => (
          <article key={g.number} className="print-block card !p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <b className="font-display text-[14px]">
                Group {g.number} ·{" "}
                {shotgun ? `Hole ${g.startHole}${g.wave ?? ""}` : `Tee ${g.startHole}`} ·{" "}
                {fmtTime(g.time)}
              </b>
              <span className="hint">{flightName(g.flightId)}</span>
            </div>
            <p className="hint mt-1">
              Players mark each other's card. Handicap index (HI) and playing handicap (PH) are
              shown for reference.
            </p>
            <ul className="plain mt-2 mb-2 grid gap-0.5 text-[12px]">
              {g.playerIds.map((id) => {
                const p = players.get(id);
                const r = regs.get(id);
                return (
                  <li key={id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{p?.name ?? "Unknown"}</span>
                    <span className="shrink-0">
                      HI {fmtIndex(r?.frozenIndex ?? null)} · PH{" "}
                      {fmtHcp(r?.playingHandicap ?? null)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {nine("Front nine", front, g)}
            <div className="h-2" />
            {nine("Back nine", back, g)}
          </article>
        ))}
      </div>
      {withPlayers.length === 0 && <p>No groups to print yet.</p>}
    </div>
  );
}
