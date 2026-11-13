import type { PublicResultRow } from "@/lib/data/public-results";

/**
 * One published leaderboard. The table is for a wide screen; the card list is
 * the same rows for a phone, where six table columns are not readable.
 */
export function ResultTable({ title, rows }: { title: string; rows: PublicResultRow[] }) {
  return (
    <section className="card grid gap-3">
      <h2 className="text-[18px] leading-6">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted text-[14px]">No published {title.toLowerCase()} results yet.</p>
      ) : (
        <>
          <ol className="grid gap-2 sm:hidden">
            {rows.map((row, index) => (
              <li
                key={`${row.playerId ?? row.playerName}-${index}`}
                className="flex items-center gap-3 rounded-[14px] border border-line bg-[var(--surface-raised)] p-3"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--gold-soft)] text-[12px] font-bold text-[var(--gold-ink)]">
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="grid min-w-0">
                    <b className="truncate text-[14px]">{row.playerName}</b>
                    <span className="truncate text-[12px] text-[var(--ink-muted)]">
                      {row.flightName ?? "—"} · {row.holesCounted}/{row.holesTotal || "—"} holes
                    </span>
                  </span>
                </span>
                <span className="grid shrink-0 text-right">
                  <b className="text-[20px] leading-5">{row.points}</b>
                  <span className="text-[11px] text-[var(--ink-muted)]">pts</span>
                  <span className="text-[11px] text-[var(--ink-muted)]">
                    {row.strokes ?? "—"} strokes
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <div className="table-wrap !shadow-none hidden sm:block">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th>Flight</th>
                  <th className="num">Points</th>
                  <th className="num">Strokes</th>
                  <th className="num">Holes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.playerId ?? row.playerName}-${index}`}>
                    <td className="num">{index + 1}</td>
                    <td>
                      <span>{row.playerName}</span>
                    </td>
                    <td>{row.flightName ?? "—"}</td>
                    <td className="num">{row.points}</td>
                    <td className="num">{row.strokes ?? "—"}</td>
                    <td className="num">
                      {row.holesCounted}/{row.holesTotal || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
