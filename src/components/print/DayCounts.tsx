import { fmtIso } from "@/lib/data/labels";
import { fmtTime } from "@/lib/format";
import type { DayCountBlock } from "@/lib/print/day-counts";

/**
 * The organisers' headcount: players per playing day, split into AM and PM, then the same players
 * listed in tee-off order so the sheet answers "how many on Saturday morning" and "who goes off
 * when" on one page. Printable through the browser's print dialog, like the other sheets.
 */
export function DayCounts({ blocks, eventName }: { blocks: DayCountBlock[]; eventName: string }) {
  return (
    <section className="grid gap-6">
      <div>
        <h2 className="text-[20px] leading-7">Players by day and session</h2>
        <p className="hint m-0">
          {eventName}. Counted from the players who selected each day; the session is the
          desk&apos;s AM or PM choice, or the one the player&apos;s tee time falls in. Tee-off times
          come from the draw.
        </p>
      </div>

      <div className="table-wrap !shadow-none">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Date</th>
              <th className="num">AM</th>
              <th className="num">PM</th>
              <th className="num">Not set</th>
              <th className="num">Players</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block) => (
              <tr key={block.dayNumber}>
                <td>
                  <b>{block.label}</b>
                </td>
                <td>{block.playDate ? fmtIso(block.playDate) : "—"}</td>
                <td className="num">{block.tally.am}</td>
                <td className="num">{block.tally.pm}</td>
                <td className="num">{block.tally.unset}</td>
                <td className="num">
                  <b>{block.tally.total}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {blocks.map((block) => (
        <div key={block.dayNumber} className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[17px] leading-6">
              {block.label}
              {block.playDate ? ` · ${fmtIso(block.playDate)}` : ""}
            </h3>
            <span className="hint m-0">
              AM {block.tally.am} · PM {block.tally.pm}
              {block.tally.unset > 0 ? ` · Not set ${block.tally.unset}` : ""} · {block.tally.total}{" "}
              player{block.tally.total === 1 ? "" : "s"}
            </span>
          </div>
          {block.rows.length === 0 ? (
            <p className="muted">No player has selected this day.</p>
          ) : (
            <div className="table-wrap !shadow-none">
              <table>
                <thead>
                  <tr>
                    <th>AM/PM</th>
                    <th>Tee off</th>
                    <th>Start hole</th>
                    <th>Player</th>
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row) => (
                    <tr key={`${block.dayNumber}-${row.entryId}`}>
                      <td>
                        <span className={row.session ? "pill info" : "pill"}>
                          {row.session ?? "Not set"}
                        </span>
                      </td>
                      <td className="num">{row.teeTime ? fmtTime(row.teeTime) : "Not assigned"}</td>
                      <td className="num">{row.startHole ?? "—"}</td>
                      <td>{row.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
