import { fmtIso } from "@/lib/data/labels";
import type { SessionKey } from "@/lib/data/sessions";
import { fmtTime } from "@/lib/format";
import type { DayCountBlock, DayGroupBlock } from "@/lib/print/day-counts";
import styles from "./print.module.css";

export type CountsGrouping = "session" | "group";

function sessionText(session: SessionKey | null): string {
  return session ?? "Not set";
}

/**
 * The organisers' headcount, on the shared print stylesheet so it prints black on white whatever
 * theme the desk uses. It can be read two ways: by AM/PM session, or by the draw's tee-off groups.
 * The same rows go to an .xlsx workbook when the desk asks for the spreadsheet.
 */
export function DayCounts({
  blocks,
  groupBlocks,
  groupBy,
  onGroupBy,
  onExport,
  eventName,
  loading = false,
}: {
  blocks: DayCountBlock[];
  groupBlocks: DayGroupBlock[];
  groupBy: CountsGrouping;
  onGroupBy: (grouping: CountsGrouping) => void;
  onExport: () => void;
  eventName: string;
  loading?: boolean;
}) {
  const totals = blocks.reduce(
    (sum, block) => ({
      am: sum.am + block.tally.am,
      pm: sum.pm + block.tally.pm,
      unset: sum.unset + block.tally.unset,
      total: sum.total + block.tally.total,
    }),
    { am: 0, pm: 0, unset: 0, total: 0 },
  );

  return (
    <section className={styles.sheet} aria-label="Player counts">
      <header className={styles.sheetHeader}>
        <h2>Players by day and session</h2>
        <p>
          {eventName} · counted from the players who selected each day · AM/PM from the desk&apos;s
          session or the draw&apos;s wave · tee-off times from the draw
        </p>
      </header>

      <div className={`${styles.countsControls} no-print`}>
        <div className="seg" role="tablist" aria-label="Group the counts">
          <button
            type="button"
            role="tab"
            aria-selected={groupBy === "session"}
            aria-pressed={groupBy === "session"}
            onClick={() => onGroupBy("session")}
          >
            By AM/PM
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={groupBy === "group"}
            aria-pressed={groupBy === "group"}
            onClick={() => onGroupBy("group")}
          >
            By group
          </button>
        </div>
        <button type="button" className="btn small" onClick={onExport}>
          Export .xlsx
        </button>
      </div>

      {loading && (
        <p className={`${styles.countsIntro} no-print`}>Loading the draw&apos;s tee times…</p>
      )}

      <table className={styles.countsTable}>
        <thead>
          <tr>
            <th>Day</th>
            <th>Date</th>
            <th className={styles.countsNum}>AM</th>
            <th className={styles.countsNum}>PM</th>
            <th className={styles.countsNum}>Not set</th>
            <th className={styles.countsNum}>Players</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr key={block.dayNumber}>
              <td>
                <b>{block.label}</b>
              </td>
              <td>{block.playDate ? fmtIso(block.playDate) : "—"}</td>
              <td className={styles.countsNum}>{block.tally.am}</td>
              <td className={styles.countsNum}>{block.tally.pm}</td>
              <td className={styles.countsNum}>{block.tally.unset}</td>
              <td className={styles.countsNum}>
                <b>{block.tally.total}</b>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <b>All days</b>
            </td>
            <td>—</td>
            <td className={styles.countsNum}>
              <b>{totals.am}</b>
            </td>
            <td className={styles.countsNum}>
              <b>{totals.pm}</b>
            </td>
            <td className={styles.countsNum}>
              <b>{totals.unset}</b>
            </td>
            <td className={styles.countsNum}>
              <b>{totals.total}</b>
            </td>
          </tr>
        </tbody>
      </table>

      {groupBy === "session"
        ? blocks.map((block) => (
            <section key={`session-${block.dayNumber}`} className={styles.countsDay}>
              <h3 className={styles.countsDayHeader}>
                <span>
                  {block.label}
                  {block.playDate ? ` · ${fmtIso(block.playDate)}` : ""}
                </span>
                <span>
                  AM {block.tally.am} · PM {block.tally.pm}
                  {block.tally.unset > 0 ? ` · Not set ${block.tally.unset}` : ""} ·{" "}
                  {block.tally.total} player{block.tally.total === 1 ? "" : "s"}
                </span>
              </h3>
              {block.rows.length === 0 ? (
                <p className={styles.countsIntro}>No player has selected this day.</p>
              ) : (
                <table className={styles.countsTable}>
                  <thead>
                    <tr>
                      <th>AM/PM</th>
                      <th>Tee off</th>
                      <th className={styles.countsNum}>Start hole</th>
                      <th className={styles.countsPlayers}>Player</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row) => (
                      <tr key={`${block.dayNumber}-${row.entryId}`}>
                        <td>{sessionText(row.session)}</td>
                        <td>{row.teeTime ? fmtTime(row.teeTime) : "Not assigned"}</td>
                        <td className={styles.countsNum}>{row.startHole ?? "—"}</td>
                        <td className={styles.countsPlayers}>{row.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))
        : groupBlocks.map((block) => (
            <section key={`group-${block.dayNumber}`} className={styles.countsDay}>
              <h3 className={styles.countsDayHeader}>
                <span>
                  {block.label}
                  {block.playDate ? ` · ${fmtIso(block.playDate)}` : ""}
                </span>
                <span>
                  {block.groups.length} group{block.groups.length === 1 ? "" : "s"} ·{" "}
                  {block.groups.reduce((sum, group) => sum + group.players.length, 0)} players
                </span>
              </h3>
              {block.groups.length === 0 ? (
                <p className={styles.countsIntro}>
                  No groups on the draw for this day yet. Make the draw first.
                </p>
              ) : (
                <table className={styles.countsTable}>
                  <thead>
                    <tr>
                      <th className={styles.countsNum}>Group</th>
                      <th>Tee off</th>
                      <th className={styles.countsNum}>Hole</th>
                      <th>AM/PM</th>
                      <th>Flight</th>
                      <th className={styles.countsPlayers}>Players</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.groups.map((group) => (
                      <tr key={group.key}>
                        <td className={styles.countsNum}>{group.number}</td>
                        <td>{group.time ? fmtTime(group.time) : "—"}</td>
                        <td className={styles.countsNum}>{group.startHole ?? "—"}</td>
                        <td>{sessionText(group.session)}</td>
                        <td>{group.flight}</td>
                        <td className={`${styles.countsPlayers} ${styles.countsGroupPlayers}`}>
                          {group.players.length === 0
                            ? "No player"
                            : group.players.map((player) => player.name).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
    </section>
  );
}
