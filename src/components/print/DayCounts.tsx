import { fmtIso } from "@/lib/data/labels";
import { fmtTime } from "@/lib/format";
import type { DayCountBlock } from "@/lib/print/day-counts";
import styles from "./print.module.css";

/**
 * The organisers' headcount: players per playing day, split into AM and PM, then the same players
 * listed in tee-off order. Built on the same print stylesheet as the start sheet and scorecards, so
 * it prints black on white whatever theme the desk is using, one playing day per page.
 */
export function DayCounts({
  blocks,
  eventName,
  loading = false,
}: {
  blocks: DayCountBlock[];
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

      {blocks.map((block) => (
        <section key={block.dayNumber} className={styles.countsDay}>
          <h3 className={styles.countsDayHeader}>
            <span>
              {block.label}
              {block.playDate ? ` · ${fmtIso(block.playDate)}` : ""}
            </span>
            <span>
              AM {block.tally.am} · PM {block.tally.pm}
              {block.tally.unset > 0 ? ` · Not set ${block.tally.unset}` : ""} · {block.tally.total}{" "}
              player{block.tally.total === 1 ? "" : "s"}
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
                  <th>Player</th>
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row) => (
                  <tr key={`${block.dayNumber}-${row.entryId}`}>
                    <td>{row.session ?? "Not set"}</td>
                    <td>{row.teeTime ? fmtTime(row.teeTime) : "Not assigned"}</td>
                    <td className={styles.countsNum}>{row.startHole ?? "—"}</td>
                    <td>{row.name}</td>
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
